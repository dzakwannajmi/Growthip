// Tip flow verification: the STRONGEST check available without the zkey —
// witness satisfaction against the real transaction2x2 circuit. A witness that
// generates under sanityCheck=true satisfies all 62,807 constraints, including
// value conservation (sumIns + publicAmount === sumOuts) and the commitment /
// nullifier bindings. Plus proof-hex encoding checks with a mock proof.
//
// Run from circuits/: node test/tip-flow.test.mjs

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(CIRCUITS_DIR, "build");
const TS_OUT = join(CIRCUITS_DIR, "ts-check", "out");

const { setCircuitBase } = require(join(TS_OUT, "poseidon2.js"));
setCircuitBase(join(BUILD, "flat"));
const keysMod = require(join(TS_OUT, "keys.js"));
const { tryDecryptNote } = require(join(TS_OUT, "noteEncryption.js"));
const { buildDepositInput, generateTipProof } = require(join(TS_OUT, "tipFlow.js"));

// Same canonical Stellar addresses as the fixture (any valid addresses work;
// these keep the scenario aligned with the cross-verified extDataHash test).
const RECIPIENT = "GCOHGXLEL4OEKN75E56Q5QJQB453QJMOSG35RJ6DR77655CPKBXKRGRO";
const RELAYER = "GDSMH6TSGB2AVFNLSGAQWV6DZQNKA7F6J6M7BQBPMANAP3EAZTONIDOM";
const DOMAIN = 1001n;
// Any known root works for a pure deposit (root check disabled on dummies);
// use the parity-locked empty root, as the live pool starts there.
const EMPTY_ROOT = BigInt(
  "0x119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680",
);

let passed = 0;
let failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${extra ? "\n      " + extra : ""}`);
  }
};

async function circuitAccepts(input) {
  const wc = require(join(BUILD, "transaction2x2_js", "witness_calculator.js"));
  const wasm = readFileSync(join(BUILD, "transaction2x2_js", "transaction2x2.wasm"));
  const w = await wc(wasm);
  try {
    await w.calculateWitness(input, true); // sanityCheck: throws on any violated constraint
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const creator = await keysMod.deriveShieldedKeys(new Uint8Array(32).fill(5));

  // ── 1. fee = 0: creator note = full tip ────────────────────────────────────
  const built0 = await buildDepositInput({
    creatorPkD: creator.pkD,
    creatorD: creator.d,
    tipAmount: 1_000_000n,
    poolCurrentRoot: EMPTY_ROOT,
    domain: DOMAIN,
    recipientAddress: RECIPIENT,
    relayerAddress: RELAYER,
  });
  ok("fee=0: creatorNoteAmount == tipAmount", built0.creatorNoteAmount === 1_000_000n);
  ok(
    "fee=0: witness satisfies ALL circuit constraints",
    await circuitAccepts(built0.input),
  );

  // ── 2. fee > 0: THE convention under test — ext_amount = tipAmount,
  //      creator note = tipAmount - fee, publicAmount = tipAmount - fee ──────
  const built = await buildDepositInput({
    creatorPkD: creator.pkD,
    creatorD: creator.d,
    tipAmount: 1_000_000n,
    fee: 10_000n,
    poolCurrentRoot: EMPTY_ROOT,
    domain: DOMAIN,
    recipientAddress: RECIPIENT,
    relayerAddress: RELAYER,
  });
  ok("fee>0: ext.extAmount == tipAmount", built.ext.extAmount === 1_000_000n);
  ok("fee>0: creatorNoteAmount == tipAmount - fee", built.creatorNoteAmount === 990_000n);
  ok("fee>0: publicAmount == tipAmount - fee", built.input.publicAmount === "990000");
  ok(
    "fee>0: witness satisfies ALL circuit constraints (value conservation incl. fee)",
    await circuitAccepts(built.input),
  );

  // ── 3. The creator can DISCOVER the note: decrypt encrypted_output0 with ivk
  //      and recover exactly (amount = tipAmount - fee, blinding used in the
  //      commitment) — closing the loop tip -> event -> discovery -> spendable.
  const dec = await tryDecryptNote(creator.ivk, built.ext.encryptedOutput0);
  ok("creator decrypts encrypted_output0", dec !== null);
  ok("decrypted amount == tipAmount - fee", dec && dec.amount === 990_000n);
  ok(
    "decrypted blinding matches the committed one",
    dec && dec.blinding.toString() === built.input.outBlinding[0],
  );

  // ── 4. Negative control: corrupt one output amount -> circuit must reject ──
  const evil = JSON.parse(JSON.stringify(built.input));
  evil.outAmount[0] = "990001"; // breaks value conservation AND the commitment
  ok("tampered outAmount rejected by circuit", !(await circuitAccepts(evil)));

  // ── 5. Wrong publicAmount (fee ignored) -> reject. This is the exact bug the
  //      ext_amount convention question was about. ───────────────────────────
  const evil2 = JSON.parse(JSON.stringify(built.input));
  evil2.publicAmount = "1000000"; // full tip, ignoring fee
  ok("publicAmount without fee subtraction rejected", !(await circuitAccepts(evil2)));

  // ── 6. Proof hex encoding via mocked prover (layout checked byte-by-byte) ──
  const mockProof = {
    pi_a: ["100", "101", "1"],
    pi_b: [["200", "201"], ["210", "211"], ["1", "0"]],
    pi_c: ["300", "301", "1"],
  };
  const { proof, ext } = await generateTipProof(built, async () => ({
    proof: mockProof,
    publicSignals: [],
  }));
  const be = (n) => BigInt(n).toString(16).padStart(64, "0");
  ok("G1 a = x||y", proof.a === be(100) + be(101));
  ok("G2 b = x_c1||x_c0||y_c1||y_c0", proof.b === be(201) + be(200) + be(211) + be(210));
  ok("proof.public_amount echoes witness", proof.public_amount === be(990000));
  ok("SAME ext object returned for transact()", ext === built.ext);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
