// ext_data_hash parity: TS (stellar-sdk ScVal XDR + keccak) vs the pool-v5
// Rust contract (`ext.to_xdr(env)` + host keccak256).
//
// Two-sided closure: the Rust side of this parity is the value YOUR emitter
// already prints — run:
//   cargo test -p pool-v5 emit_deposit_fixture -- --nocapture --ignored
// and compare FIXTURE_EXTHASH against EXPECTED_FIXTURE_EXTHASH below. They must
// be byte-identical. The TS value below was computed in the design sandbox for
// the exact canonical fixture ExtData (FX_RECIPIENT / FX_RELAYER constants,
// ext_amount=100, fee=0, empty encrypted outputs).
//
// Run from circuits/: node test/extdata-hash-parity.test.mjs

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TS_OUT = join(CIRCUITS_DIR, "ts-check", "out");
const { computeExtDataHash, calcPublicAmount, FIELD } = require(join(TS_OUT, "extDataHash.js"));

// MUST match contracts/pool-v5/src/test.rs FX_RECIPIENT / FX_RELAYER and the
// deposit_fixture_ext() shape exactly.
const CANONICAL_EXT = {
  extAmount: 100n,
  fee: 0n,
  recipient: "GCOHGXLEL4OEKN75E56Q5QJQB453QJMOSG35RJ6DR77655CPKBXKRGRO",
  relayer: "GDSMH6TSGB2AVFNLSGAQWV6DZQNKA7F6J6M7BQBPMANAP3EAZTONIDOM",
  encryptedOutput0: new Uint8Array(0),
  encryptedOutput1: new Uint8Array(0),
};

// TS-side value (sandbox). The Rust emitter's FIXTURE_EXTHASH must equal this.
const EXPECTED_FIXTURE_EXTHASH =
  "2a70fdae388029aeac29dc6521cf5830c5cf7453b7920e0bb6ffc01b5244efe1";

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

const hex = (x) => x.toString(16).padStart(64, "0");

const h = computeExtDataHash(CANONICAL_EXT);
ok(
  "canonical ExtData hash matches sandbox-locked value",
  hex(h) === EXPECTED_FIXTURE_EXTHASH,
  `got ${hex(h)}`,
);
console.log(
  "  -> CROSS-CHECK: this MUST equal the FIXTURE_EXTHASH printed by\n" +
    "     `cargo test -p pool-v5 emit_deposit_fixture -- --nocapture --ignored`.\n" +
    "     If the Rust value differs, STOP: the TS XDR encoding diverges from the\n" +
    "     contract and every production tip would fail WrongExtHash.",
);

// Determinism + sensitivity checks: any single change must change the hash.
ok("deterministic across calls", computeExtDataHash(CANONICAL_EXT) === h);
ok(
  "changing ext_amount changes hash",
  computeExtDataHash({ ...CANONICAL_EXT, extAmount: 101n }) !== h,
);
ok(
  "changing recipient changes hash",
  computeExtDataHash({ ...CANONICAL_EXT, recipient: CANONICAL_EXT.relayer }) !== h,
);
ok(
  "changing ciphertext changes hash",
  computeExtDataHash({ ...CANONICAL_EXT, encryptedOutput0: new Uint8Array([1]) }) !== h,
);

// publicAmount encoding parity with the contract's calc_public_amount.
ok("publicAmount deposit (+100)", calcPublicAmount(CANONICAL_EXT) === 100n);
ok(
  "publicAmount withdraw wraps to p - x",
  calcPublicAmount({ ...CANONICAL_EXT, extAmount: -600000n }) === FIELD - 600000n,
);
ok(
  "publicAmount fee is subtracted",
  calcPublicAmount({ ...CANONICAL_EXT, extAmount: 100n, fee: 30n }) === 70n,
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
