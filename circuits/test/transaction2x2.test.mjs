// transaction2x2.circom — executable security test suite.
//
// Happy paths: the witness must generate AND pass a full `snarkjs wtns check`
// against the R1CS (every constraint, not just the wasm asserts).
// Attacks: witness generation with sanityCheck=true must THROW; if it does
// not, we fall back to `wtns check` and require it to fail there.
//
// Run: node test/transaction2x2.test.mjs   (from circuits/)

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import {
  BN254_P,
  SUBGROUP_L,
  DEPTH,
  initCrypto,
  randomKeys,
  pseudoRandom,
  noteCommitment,
  nullifierOf,
  MerkleTree,
  publicAmount,
  dummyInput,
  realInput,
  makeOutput,
  txInput,
} from "./lib.mjs";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(CIRCUITS_DIR, "build");
const R1CS = join(BUILD, "transaction2x2.r1cs");
const TMP = mkdtempSync(join(tmpdir(), "tx2x2-"));

const DOMAIN_XLM = 1001n; // stand-ins for the per-pool init() values
const DOMAIN_USDC = 1002n;
const EXT = pseudoRandom(); // extDataHash stand-in (semantics checked on-chain)

let txW;
async function initMain() {
  const wc = require(join(BUILD, "transaction2x2_js", "witness_calculator.js"));
  const wasm = readFileSync(join(BUILD, "transaction2x2_js", "transaction2x2.wasm"));
  txW = await wc(wasm);
}

let passed = 0;
let failed = 0;
const fail = (name, msg) => {
  failed++;
  console.log(`FAIL  ${name} — ${msg}`);
};
const pass = (name) => {
  passed++;
  console.log(`PASS  ${name}`);
};

// Happy path: witness generates + full R1CS check passes.
async function expectValid(name, input) {
  try {
    const wtns = join(TMP, `${name.replaceAll(/\W/g, "_")}.wtns`);
    await txW.calculateWTNSBin(input, true).then((buf) => writeFileSync(wtns, buf));
    const ok = await snarkjs.wtns.check(R1CS, wtns, { info() {}, debug() {}, error() {}, warn() {} });
    ok ? pass(name) : fail(name, "wtns check reported unsatisfied constraints");
  } catch (e) {
    fail(name, `witness generation threw: ${String(e).slice(0, 140)}`);
  }
}

// Attack: witness must throw, or at minimum fail the full R1CS check.
async function expectInvalid(name, input) {
  try {
    const buf = await txW.calculateWTNSBin(input, true);
    const wtns = join(TMP, `${name.replaceAll(/\W/g, "_")}.wtns`);
    writeFileSync(wtns, buf);
    let ok = false;
    try {
      ok = await snarkjs.wtns.check(R1CS, wtns, { info() {}, debug() {}, error() {}, warn() {} });
    } catch {
      ok = false;
    }
    ok
      ? fail(name, "malicious witness SATISFIED all constraints — soundness hole")
      : pass(name);
  } catch {
    pass(name); // wasm assert fired during generation — constraint rejected it
  }
}

async function main() {
  await initCrypto();
  await initMain();

  // ── Shared fixture: a tree holding two real notes ──────────────────────────
  const alice = await randomKeys(); // supporter
  const bob = await randomKeys(1n); // creator (different diversifier)
  const tree = new MerkleTree();
  await tree.init();

  const aliceBlinding = pseudoRandom();
  const aliceAmount = 1_000_000n;
  const aliceCommitment = await noteCommitment(aliceAmount, alice.pkd, aliceBlinding);
  const aliceLeaf = tree.insert(aliceCommitment);

  const bobBlinding = pseudoRandom();
  const bobAmount = 250_000n;
  const bobCommitment = await noteCommitment(bobAmount, bob.pkd, bobBlinding);
  tree.insert(bobCommitment);

  const root = await tree.root();

  // ══ HAPPY PATHS ═════════════════════════════════════════════════════════

  // H1 — deposit: two dummy inputs, publicAmount +X, one real output note.
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(500_000n, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectValid("H1 deposit (2 dummy in, +publicAmount)", txInput({
      root,
      pubAmount: publicAmount(500_000n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [out0, out1],
    }));
  }

  // H2 — private transfer: alice spends her note, tips bob, keeps change.
  {
    const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
    const inDummy = await dummyInput(root);
    const tip = await makeOutput(300_000n, bob.pkd);
    const change = await makeOutput(700_000n, alice.pkd);
    await expectValid("H2 transfer (spend note, tip + change, publicAmount 0)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [inReal, inDummy.input],
      outs: [tip, change],
    }));
  }

  // H3 — withdraw: spend note, negative publicAmount (p - x), change note.
  {
    const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
    const inDummy = await dummyInput(root);
    const change = await makeOutput(400_000n, alice.pkd);
    const zero = await makeOutput(0n, alice.pkd);
    await expectValid("H3 withdraw (negative publicAmount, field-wrapped)", txInput({
      root,
      pubAmount: publicAmount(-600_000n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [inReal, inDummy.input],
      outs: [change, zero],
    }));
  }

  // H4 — documented behavior: dummy inputs ignore the root entirely.
  // This is BY DESIGN (deposits need no pre-existing tree state); flag it so
  // nobody mistakes it for a hole: with amount==0 nothing of value is spent.
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(100n, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectValid("H4 dummy inputs accept ANY root (intended: enables deposits)", txInput({
      root: 12345n, // garbage root
      pubAmount: publicAmount(100n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [out0, out1],
    }));
  }

  // ══ ATTACKS ═════════════════════════════════════════════════════════════

  // A1 — double-spend: same note in both input slots -> identical nullifiers.
  {
    const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
    const out0 = await makeOutput(2n * aliceAmount, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A1 double-spend same note in one tx (I6)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [inReal, inReal],
      outs: [out0, out1],
    }));
  }

  // A2 — fake root with a real (nonzero) input.
  {
    const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
    const inDummy = await dummyInput(root);
    const out0 = await makeOutput(aliceAmount, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A2 forged root on a real input (I4)", txInput({
      root: 999999n,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [inReal, inDummy.input],
      outs: [out0, out1],
    }));
  }

  // A3 — the mint attack: output overflow. sum(outs) ≡ sumIns + pub (mod p)
  // holds arithmetically, but out0 = p - 5 needs 254 bits -> Num2Bits(248).
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(BN254_P - 5n, alice.pkd);
    const out1 = await makeOutput(6n, alice.pkd);
    await expectInvalid("A3 mint via output amount overflow (I5 output side)", txInput({
      root,
      pubAmount: publicAmount(1n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [out0, out1],
    }));
  }

  // A3b — same trick on the input side.
  {
    const inDummy = await dummyInput(root);
    const evil = { ...inDummy.input, amount: BN254_P - 5n };
    // recompute matching commitment/nullifier so ONLY the range check trips
    evil.nullifier = await nullifierOf(
      await noteCommitment(evil.amount, inDummy.keys.pkd, evil.blinding),
      0n,
      inDummy.keys.nkFold,
    );
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(1n, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A3b input amount overflow (I5 input side)", txInput({
      root,
      pubAmount: publicAmount(6n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [evil, d1.input],
      outs: [out0, out1],
    }));
  }

  // A4 — forged nullifier for a real spend.
  {
    const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
    inReal.nullifier = pseudoRandom();
    const inDummy = await dummyInput(root);
    const out0 = await makeOutput(aliceAmount, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A4 forged nullifier (I3)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [inReal, inDummy.input],
      outs: [out0, out1],
    }));
  }

  // A5 — recipient swap after commitment fixed: outputCommitment[0] says bob,
  // but the out signals say alice (post-proof recipient substitution).
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const blinding = pseudoRandom();
    const bobCommit = await noteCommitment(500n, bob.pkd, blinding);
    const evilOut = { commitment: bobCommit, amount: 500n, pkd: alice.pkd, blinding };
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A5 recipient swap vs fixed commitment", txInput({
      root,
      pubAmount: publicAmount(500n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [evilOut, out1],
    }));
  }

  // A6 — non-canonical spend scalar (ask = L aliases ask = 0).
  {
    const d0 = await dummyInput(root);
    const evil = { ...d0.input, ask: SUBGROUP_L };
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(0n, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A6 non-canonical ask >= L (I1)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [evil, d1.input],
      outs: [out0, out1],
    }));
  }

  // A7 — spend someone else's note: bob's commitment is in the tree; attacker
  // (alice keys) presents bob's leaf with her own scalars.
  {
    const { pathElements, pathIndices } = await tree.path(1); // bob's leaf
    const stolen = {
      nullifier: await nullifierOf(bobCommitment, pathIndices, alice.nkFold),
      amount: bobAmount,
      ask: alice.ask,
      nsk: alice.nsk,
      d: alice.d,
      blinding: bobBlinding, // even with the leaked blinding...
      pathIndices,
      pathElements,
    };
    const inDummy = await dummyInput(root);
    const out0 = await makeOutput(bobAmount, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A7 spend another owner's note without their ask/nsk (I2)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [stolen, inDummy.input],
      outs: [out0, out1],
    }));
  }

  // A8 — value conservation violation (free money, no overflow needed).
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const out0 = await makeOutput(200n, alice.pkd);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A8 sumIns + publicAmount != sumOuts (I7)", txInput({
      root,
      pubAmount: publicAmount(100n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [out0, out1],
    }));
  }

  // A9 — off-curve recipient point (I9: rejected in-circuit).
  {
    const d0 = await dummyInput(root);
    const d1 = await dummyInput(root);
    const evilOut = {
      commitment: 0n, // never reached; BabyCheck fires first
      amount: 0n,
      pkd: { x: 3n, y: 7n }, // not on Baby Jubjub
      blinding: pseudoRandom(),
    };
    evilOut.commitment = await noteCommitment(0n, evilOut.pkd, evilOut.blinding);
    const out1 = await makeOutput(0n, alice.pkd);
    await expectInvalid("A9 off-curve recipient point (I9)", txInput({
      root,
      pubAmount: publicAmount(0n),
      extDataHash: EXT,
      domain: DOMAIN_XLM,
      ins: [d0.input, d1.input],
      outs: [evilOut, out1],
    }));
  }

  // NOTE on domain replay (XLM vs USDC pools): the circuit correctly treats
  // `domain` as an opaque public input — a proof made with DOMAIN_XLM is valid
  // circuit-wise under DOMAIN_XLM forever. Cross-pool replay is prevented
  // ON-CHAIN: each pool passes ITS OWN stored domain to the verifier, so a
  // proof bound to DOMAIN_XLM fails Groth16 verification on the USDC pool.
  // That property belongs to the Day-3 contract test suite, not this one.
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
