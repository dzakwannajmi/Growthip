// Test input generator for the V4 circuit (depth-20, 2^20 leaves).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const circomlibjs = require("circomlibjs");

const DEPTH = 20;
const MAX_LEAVES = 1 << DEPTH; // 1,048,576
const TARGET_INDEX = 5; // use non-zero index to exercise bit derivation

function randomFieldDecimal() {
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

async function main() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const hash1 = (a) => F.toString(poseidon([BigInt(a)]));
  const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));
  const hash3 = (a, b, c) => F.toString(poseidon([BigInt(a), BigInt(b), BigInt(c)]));

  const secret        = randomFieldDecimal();
  const nullifier     = randomFieldDecimal();
  const recipientId   = randomFieldDecimal();
  const recipientHash = hash1(recipientId);
  const commitment    = hash3(secret, nullifier, recipientHash);
  const nullifierHash = hash1(nullifier);

  // Build sparse tree of depth 20 — only store what we need for the path.
  // All empty leaves = "0", internal empty nodes precomputed bottom-up.
  const EMPTY = "0";

  // Precompute empty node at each level
  const emptyNodes = [EMPTY];
  for (let i = 1; i <= DEPTH; i++) {
    emptyNodes.push(hash2(emptyNodes[i-1], emptyNodes[i-1]));
  }

  // Build path for TARGET_INDEX
  const pathElements = [];
  const pathIndices  = [];

  // At level 0: only TARGET_INDEX has commitment, all others empty
  let currentLeaf = commitment;
  let idx = TARGET_INDEX;

  for (let level = 0; level < DEPTH; level++) {
    const isRight = idx % 2 === 1;
    if (isRight) {
      // our node is right child, sibling is left = empty
      pathElements.push(emptyNodes[level]);
      pathIndices.push("1");
    } else {
      // our node is left child, sibling is right = empty
      pathElements.push(emptyNodes[level]);
      pathIndices.push("0");
    }
    idx = Math.floor(idx / 2);
  }

  // Compute root by hashing up with siblings
  let node = commitment;
  idx = TARGET_INDEX;
  for (let level = 0; level < DEPTH; level++) {
    const isRight = idx % 2 === 1;
    if (isRight) {
      node = hash2(pathElements[level], node);
    } else {
      node = hash2(node, pathElements[level]);
    }
    idx = Math.floor(idx / 2);
  }
  const root = node;

  const input = { secret, nullifier, pathElements, pathIndices, recipientHash };

  const outPath = path.join("circuits", "growthip_merkle_note_v4_input.json");
  fs.writeFileSync(outPath, JSON.stringify(input, null, 2));

  console.log("=== Growthip Merkle V4 test input (depth=20, leafIndex=5) ===");
  console.log("leafIndex (expected circuit output):", TARGET_INDEX);
  console.log("commitment                         :", commitment);
  console.log("nullifierHash                      :", nullifierHash);
  console.log("recipientHash                      :", recipientHash);
  console.log("root                               :", root);
  console.log("pathIndices (first 5 bits)         :", pathIndices.slice(0,5).join(","));
  console.log("");
  // Verify index derivation
  let indexCheck = 0;
  for (let i = 0; i < DEPTH; i++) {
    indexCheck += Number(pathIndices[i]) * (1 << i);
  }
  console.log("Index check:", indexCheck, "(should be", TARGET_INDEX, ")");
}

main().catch((err) => { console.error(err); process.exit(1); });
