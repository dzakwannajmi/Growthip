#!/usr/bin/env node
// Generates a REAL Groth16 deposit proof whose public signals match the values
// pool-v5's `emit_deposit_fixture` test prints, then writes the proof + public
// inputs as hex files that the Rust E2E test (`e2e_deposit_moves_custody...`)
// includes via include_str!.
//
// Chicken-egg resolution (same pattern as Cyphras vault tests):
//   1. `cargo test -p pool-v5 emit_deposit_fixture -- --nocapture --ignored`
//      prints FIXTURE_ROOT / FIXTURE_EXTHASH / FIXTURE_PUBAMOUNT / FIXTURE_DOMAIN.
//   2. Pass those into this script via env vars (see HARI3-INSTRUKSI.md).
//   3. This builds a 2-in (both dummy) / 2-out deposit witness binding exactly
//      those signals, proves it, and emits hex.
//
// Byte layout (matches zk-types + host BN254 encoding, per Cyphras verifier/build.rs):
//   G1 = x(32) || y(32)                              -> 64 bytes
//   G2 = x_c1(32) || x_c0(32) || y_c1(32) || y_c0(32) -> 128 bytes  (snarkjs stores [c0,c1])
//   field elements: 32-byte big-endian
//
// Requires: circuits/keys/transaction2x2.zkey + verification_key.json (trusted
// setup, Day 2). Run from circuits/.
//
// Usage:
//   FIXTURE_ROOT=... FIXTURE_EXTHASH=... FIXTURE_PUBAMOUNT=... FIXTURE_DOMAIN=... \
//     node scripts/gen-contract-fixture.mjs

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import {
  initCrypto,
  randomKeys,
  pseudoRandom,
  noteCommitment,
  nullifierOf,
  makeOutput,
  txInput,
  BN254_P,
  DEPTH,
} from "../test/lib.mjs";

const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(CIRCUITS_DIR, "build");
const OUT = join(BUILD, "fixtures");
const WASM = join(BUILD, "transaction2x2_js", "transaction2x2.wasm");
const ZKEY = join(CIRCUITS_DIR, "keys", "transaction2x2.zkey");

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`missing env ${name} — run emit_deposit_fixture first (see HARI3-INSTRUKSI.md)`);
    process.exit(1);
  }
  return BigInt("0x" + v.replace(/^0x/, ""));
};

const be32 = (v) => BigInt(v).toString(16).padStart(64, "0");

// snarkjs proof -> host byte layout hex.
function proofToHex(proof) {
  const g1 = (p) => be32(p[0]) + be32(p[1]);
  // snarkjs pi_b: [[x_c0, x_c1], [y_c0, y_c1]]; host wants c1||c0.
  const g2 = (p) => be32(p[0][1]) + be32(p[0][0]) + be32(p[1][1]) + be32(p[1][0]);
  return { a: g1(proof.pi_a), b: g2(proof.pi_b), c: g1(proof.pi_c) };
}

async function main() {
  if (!existsSync(ZKEY)) {
    console.error(`missing ${ZKEY}\nrun: npm run setup (downloads ptau + runs trusted setup)`);
    process.exit(1);
  }
  await initCrypto();
  mkdirSync(OUT, { recursive: true });

  const ROOT = need("FIXTURE_ROOT");
  const EXTHASH = need("FIXTURE_EXTHASH");
  const PUBAMOUNT = need("FIXTURE_PUBAMOUNT");
  const DOMAIN = need("FIXTURE_DOMAIN");

  // Deposit: two DUMMY inputs (amount 0, any root accepted), publicAmount = +100,
  // one real output note holding 100, one zero note. Mirrors happy-path H1 but
  // pinned to the pool's exact root/extHash/pubAmount/domain.
  const recipient = await randomKeys(1n);

  const mkDummy = async () => {
    const keys = await randomKeys();
    const blinding = pseudoRandom();
    const commitment = await noteCommitment(0n, keys.pkd, blinding);
    const nullifier = await nullifierOf(commitment, 0n, keys.nkFold);
    return {
      nullifier,
      amount: 0n,
      ask: keys.ask,
      nsk: keys.nsk,
      d: keys.d,
      blinding,
      pathIndices: 0n,
      pathElements: Array(DEPTH).fill(0n),
    };
  };

  const in0 = await mkDummy();
  const in1 = await mkDummy();
  const out0 = await makeOutput(100n, recipient.pkd);
  const out1 = await makeOutput(0n, recipient.pkd);

  const input = txInput({
    root: ROOT,
    pubAmount: PUBAMOUNT,
    extDataHash: EXTHASH,
    domain: DOMAIN,
    ins: [in0, in1],
    outs: [out0, out1],
  });

  // Sanity: our computed publicAmount encoding must match the contract's.
  if (PUBAMOUNT !== 100n) {
    // publicAmount for +100 is just 100; guard against a mismatched emitter run.
    console.warn(`note: FIXTURE_PUBAMOUNT=${PUBAMOUNT} (expected 100 for a +100 deposit)`);
  }

  console.log("proving (real Groth16, transaction2x2.zkey)...");
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    // stringify bigints for snarkjs
    JSON.parse(JSON.stringify(input, (_k, v) => (typeof v === "bigint" ? v.toString() : v))),
    WASM,
    ZKEY,
  );

  // Verify locally before emitting — never ship a fixture that doesn't verify.
  const vk = JSON.parse(
    (await import("node:fs")).readFileSync(join(CIRCUITS_DIR, "keys", "verification_key.json")),
  );
  const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
  if (!ok) {
    console.error("generated proof FAILED local verification — aborting");
    process.exit(1);
  }
  console.log("local verify: OK");

  const { a, b, c } = proofToHex(proof);
  const w = (name, val) => writeFileSync(join(OUT, name), val);
  w("deposit_a.hex", a);
  w("deposit_b.hex", b);
  w("deposit_c.hex", c);
  w("deposit_root.hex", be32(ROOT));
  w("deposit_pubamount.hex", be32(PUBAMOUNT));
  w("deposit_exthash.hex", be32(EXTHASH));
  w("deposit_null0.hex", be32(in0.nullifier));
  w("deposit_null1.hex", be32(in1.nullifier));
  w("deposit_comm0.hex", be32(out0.commitment));
  w("deposit_comm1.hex", be32(out1.commitment));

  console.log(`\nwrote 10 fixture files to ${OUT}`);
  console.log("now un-ignore e2e_deposit_moves_custody_and_spends_nullifiers and run:");
  console.log("  cargo test -p pool-v5");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
