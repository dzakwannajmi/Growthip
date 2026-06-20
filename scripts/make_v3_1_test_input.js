// Test input generator for the V3.1 circuit (index public output added).
// Deliberately uses leafIndex = 5 (binary 101), NOT 0, so the
// index-derivation logic in the circuit is genuinely exercised across
// multiple non-trivial bits -- testing at index 0 would trivially pass
// even with a broken derivation, since all pathIndices bits would be 0.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const circomlibjs = require("circomlibjs");

const buildDir = path.join("circuits", "build");

function randomFieldDecimal() {
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

async function main() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;
  const hash1 = (a) => F.toString(poseidon([BigInt(a)]));
  const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));
  const hash3 = (a, b, c) => F.toString(poseidon([BigInt(a), BigInt(b), BigInt(c)]));

  const secret      = randomFieldDecimal();
  const nullifier   = randomFieldDecimal();
  const recipientId = randomFieldDecimal();
  const recipientHash = hash1(recipientId);
  const commitment    = hash3(secret, nullifier, recipientHash);
  const nullifierHash = hash1(nullifier);

  // Place the real commitment at leaf index 5, pad the rest with "0".
  const TARGET_INDEX = 5;
  const leaves = ["0", "0", "0", "0", "0", "0", "0", "0"];
  leaves[TARGET_INDEX] = commitment;

  const level1 = [];
  for (let i = 0; i < 8; i += 2) {
    level1.push(hash2(leaves[i], leaves[i + 1]));
  }
  const level2 = [];
  for (let i = 0; i < 4; i += 2) {
    level2.push(hash2(level1[i], level1[i + 1]));
  }
  const root = hash2(level2[0], level2[1]);

  // Derive Merkle path for leafIndex = 5, matching getMerklePathByIndex()
  // in merkle.ts exactly (bit = index % 2 at each level, then index = floor(index/2)).
  let idx = TARGET_INDEX;
  const pathElements = [];
  const pathIndices  = [];
  for (let level = 0; level < 3; level++) {
    const isRight = idx % 2 === 1;
    const siblingIndex = isRight ? idx - 1 : idx + 1;
    const layer = level === 0 ? leaves : (level === 1 ? level1 : level2);
    pathElements.push(layer[siblingIndex]);
    pathIndices.push(isRight ? "1" : "0");
    idx = Math.floor(idx / 2);
  }

  const input = { secret, nullifier, pathElements, pathIndices, recipientHash };

  fs.writeFileSync(
    path.join("circuits", "growthip_merkle_note_v3_1_input.json"),
    JSON.stringify(input, null, 2)
  );

  console.log("=== Growthip Merkle V3.1 test input (leafIndex=5) ===");
  console.log("leafIndex (expected circuit output) :", TARGET_INDEX);
  console.log("pathIndices (LSB first)              :", pathIndices.join(","));
  console.log("commitment                           :", commitment);
  console.log("nullifierHash                        :", nullifierHash);
  console.log("recipientHash                        :", recipientHash);
  console.log("root                                 :", root);
  console.log("");
  console.log("Manual check: pathIndices[0]*1 + pathIndices[1]*2 + pathIndices[2]*4 =",
    Number(pathIndices[0]) * 1 + Number(pathIndices[1]) * 2 + Number(pathIndices[2]) * 4,
    "(should equal", TARGET_INDEX, ")");
}

main().catch((err) => { console.error(err); process.exit(1); });