// Generates Poseidon test vectors using the SAME code path as
// production (apps/web/src/lib/poseidon.ts), via circomlibjs
// buildPoseidon() directly — i.e. the "_opt" sparse-optimized
// runtime path, NOT the raw constants we extracted for Rust.
//
// Purpose: produce ground-truth hash outputs for fixed inputs, to
// compare against whatever the Rust contract computes using
// poseidon_permutation() + the extracted raw constants. If both
// paths are mathematically the same Poseidon instance (which they
// must be — circomlib opt vs raw forms are optimizations of the
// identical algorithm, not different algorithms), outputs MUST match
// exactly. Any mismatch means our Rust extraction or the on-chain
// call is wrong.

import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();

function hashDecimal(inputs) {
  const out = poseidon(inputs.map(BigInt));
  return poseidon.F.toString(out);
}

// Fixed test inputs — small, deterministic, easy to hardcode in Rust tests.
const testVectors = {
  hash1_input_123: {
    inputs: ["123"],
    output: hashDecimal(["123"]),
  },
  hash1_input_456: {
    inputs: ["456"],
    output: hashDecimal(["456"]),
  },
  hash2_inputs_1_2: {
    inputs: ["1", "2"],
    output: hashDecimal(["1", "2"]),
  },
  hash2_inputs_100_200: {
    inputs: ["100", "200"],
    output: hashDecimal(["100", "200"]),
  },
  hash3_inputs_1_2_3: {
    inputs: ["1", "2", "3"],
    output: hashDecimal(["1", "2", "3"]),
  },
  hash3_secret_nullifier_recipient: {
    inputs: ["111111", "222222", "333333"],
    output: hashDecimal(["111111", "222222", "333333"]),
  },
};

console.log(JSON.stringify(testVectors, null, 2));

// Also write to file for the Rust test to reference.
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
writeFileSync(
  join(__dirname, "..", "contracts", "growthip-pool", "poseidon_test_vectors.json"),
  JSON.stringify(testVectors, null, 2)
);
console.log("\nWritten to contracts/growthip-pool/poseidon_test_vectors.json");
