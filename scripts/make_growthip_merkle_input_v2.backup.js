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

  // Demo recipient field. Later this will be tied to creator registration.
  const recipientId = "20260612";
  const recipientHash = hash1(recipientId);

  const commitment = hash2(secret, nullifier);
  const nullifierHash = hash1(nullifier);

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
    recipientHash,
  };

  fs.writeFileSync(
    path.join("circuits", "growthip_merkle_note_v2_input.json"),
    JSON.stringify(input, null, 2)
  );

  console.log("Growthip Merkle v2 input generated.");
  console.log("commitment:", commitment);
  console.log("nullifierHash:", nullifierHash);
  console.log("recipientHash:", recipientHash);
  console.log("root:", root);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
