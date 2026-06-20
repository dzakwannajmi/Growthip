// Generates a Merkle tree test vector using the SAME code path as
// production (apps/web/src/lib/merkle.ts), to verify rebuild_merkle_root()
// in the contract produces an identical root for the same commitments.

import { buildPoseidon } from "circomlibjs";

const poseidon = await buildPoseidon();

function hash2Decimal(a, b) {
  const out = poseidon([BigInt(a), BigInt(b)]);
  return poseidon.F.toString(out);
}

const TREE_DEPTH = 3;
const MAX_LEAVES = 8;
const EMPTY_LEAF = "0";

async function buildMerkleTree(commitments) {
  if (commitments.length > MAX_LEAVES) {
    throw new Error("too many commitments");
  }
  const leaves = [...commitments];
  while (leaves.length < MAX_LEAVES) leaves.push(EMPTY_LEAF);

  const layers = [leaves];
  let current = leaves;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(hash2Decimal(current[i], current[i + 1]));
    }
    layers.push(next);
    current = next;
  }
  return { root: layers[layers.length - 1][0], layers, leaves };
}

// Test with 3 commitments (small decimal values for easy hardcoding in Rust).
// Real commitments would be Poseidon outputs, but for verifying tree
// construction logic itself, any field elements work — the tree-building
// algorithm doesn't care what the leaf values "mean".
const testCommitments = ["111", "222", "333"];

const tree = await buildMerkleTree(testCommitments);

console.log("Test commitments:", testCommitments);
console.log("Padded leaves:", tree.leaves);
console.log("Root:", tree.root);
console.log("\nLayers:");
tree.layers.forEach((layer, i) => {
  console.log(`  layer[${i}] (${layer.length} nodes):`, layer);
});
