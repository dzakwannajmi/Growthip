const fs = require("fs");
const path = require("path");
const circomlibjs = require("circomlibjs");

async function main() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const hash1 = (a) => F.toString(poseidon([BigInt(a)]));
  const hash2 = (a, b) => F.toString(poseidon([BigInt(a), BigInt(b)]));

  const secret = "123456789";
  const nullifier = "987654321";

  const commitment = hash2(secret, nullifier);
  const nullifierHash = hash1(nullifier);

  // Demo tree depth 3, index 0.
  // Leaf 0 is our commitment. Other leaves are zero.
  const leaves = [
    commitment,
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
    "0",
  ];

  const level1 = [];
  for (let i = 0; i < 8; i += 2) {
    level1.push(hash2(leaves[i], leaves[i + 1]));
  }

  const level2 = [];
  for (let i = 0; i < 4; i += 2) {
    level2.push(hash2(level1[i], level1[i + 1]));
  }

  const root = hash2(level2[0], level2[1]);

  // Leaf index 0 path:
  // sibling at level 0: leaves[1]
  // sibling at level 1: level1[1]
  // sibling at level 2: level2[1]
  const pathElements = [
    leaves[1],
    level1[1],
    level2[1],
  ];

  const pathIndices = ["0", "0", "0"];

  const input = {
    secret,
    nullifier,
    pathElements,
    pathIndices,
  };

  fs.writeFileSync(
    path.join("circuits", "growthip_merkle_note_input.json"),
    JSON.stringify(input, null, 2)
  );

  console.log("Growthip Merkle input generated.");
  console.log("commitment:", commitment);
  console.log("nullifierHash:", nullifierHash);
  console.log("root:", root);
  console.log("pathElements:", pathElements);
  console.log("pathIndices:", pathIndices);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
