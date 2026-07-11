#!/usr/bin/env node
// Measures actual Groth16 proving time for transaction2x2.circom, using a
// real H2 (private transfer) scenario built with the SAME input generators
// as test/transaction2x2.test.mjs (test/lib.mjs) -- not a re-implementation.
//
// Requires keys/transaction2x2.zkey (run `npm run setup` first).
// Usage: node scripts/measure-proving-time.mjs
//
// NOTE: this measures Node.js-side proving (snarkjs's WASM witness
// calculator running under Node). It's a solid proxy/lower bound for actual
// browser proving time, not an identical measurement -- browsers can be
// somewhat slower for the same WASM execution. Treat this as a ballpark,
// re-measure in-browser once frontend integration happens (Day 4+).

import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as snarkjs from "snarkjs";
import {
  initCrypto,
  randomKeys,
  noteCommitment,
  pseudoRandom,
  MerkleTree,
  publicAmount,
  dummyInput,
  realInput,
  makeOutput,
  txInput,
} from "../test/lib.mjs";

const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WASM = join(CIRCUITS_DIR, "build", "transaction2x2_js", "transaction2x2.wasm");
const ZKEY = join(CIRCUITS_DIR, "keys", "transaction2x2.zkey");
const VK = join(CIRCUITS_DIR, "keys", "verification_key.json");

// Arbitrary but valid field elements -- stand in for a real
// keccak256(XDR(ext)) hash and a real per-pool domain tag. Don't need to
// match the test suite's exact values for a proving-time measurement.
const EXT = 12345n;
const DOMAIN_XLM = 1n;

async function main() {
  await initCrypto();

  const alice = await randomKeys();
  const bob = await randomKeys();

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

  // H2 scenario: alice spends her note, tips bob, keeps change.
  const inReal = await realInput(tree, alice, aliceAmount, aliceBlinding, aliceLeaf);
  const inDummy = await dummyInput(root);
  const tip = await makeOutput(300_000n, bob.pkd);
  const change = await makeOutput(700_000n, alice.pkd);

  const input = txInput({
    root,
    pubAmount: publicAmount(0n),
    extDataHash: EXT,
    domain: DOMAIN_XLM,
    ins: [inReal, inDummy.input],
    outs: [tip, change],
  });

  console.log("input built, generating proof...");
  const t0 = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  const t1 = performance.now();

  const proveMs = t1 - t0;
  console.log(`\nfullProve time: ${proveMs.toFixed(1)} ms (${(proveMs / 1000).toFixed(2)} s)`);

  console.log("verifying proof...");
  const vk = JSON.parse(readFileSync(VK, "utf8"));
  const t2 = performance.now();
  const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
  const t3 = performance.now();
  console.log(`verify time: ${(t3 - t2).toFixed(1)} ms — result: ${ok ? "VALID" : "INVALID"}`);

  if (!ok) {
    console.error("\nProof did not verify! Something is wrong.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
