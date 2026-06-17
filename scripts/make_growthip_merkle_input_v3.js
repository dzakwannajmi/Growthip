const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const circomlibjs = require("circomlibjs");

const buildDir = path.join("circuits", "build");

function randomFieldDecimal() {
  // BN254 scalar field ~254 bits. 31 random bytes stays safely below field size.
  return BigInt("0x" + crypto.randomBytes(31).toString("hex")).toString();
}

async function main() {
  const poseidon = await circomlibjs.buildPoseidon();
  const F = poseidon.F;

  const hash1 = (a) =>
    F.toString(poseidon([BigInt(a)]));
  const hash2 = (a, b) =>
    F.toString(poseidon([BigInt(a), BigInt(b)]));
  const hash3 = (a, b, c) =>
    F.toString(poseidon([BigInt(a), BigInt(b), BigInt(c)]));

  const secret      = randomFieldDecimal();
  const nullifier   = randomFieldDecimal();
  const recipientId = randomFieldDecimal();

  // V3: recipientHash is derived from recipientId (arbitrary field element here).
  // In production this should be derived from the creator's Stellar address.
  const recipientHash  = hash1(recipientId);

  // V3: commitment binds all three
  const commitment   = hash3(secret, nullifier, recipientHash);
  const nullifierHash = hash1(nullifier);

  // Build a depth-3 Merkle tree with commitment at index 0
  const leaves = [commitment, "0", "0", "0", "0", "0", "0", "0"];

  const level1 = [];
  for (let i = 0; i < 8; i += 2) {
    level1.push(hash2(leaves[i], leaves[i + 1]));
  }

  const level2 = [];
  for (let i = 0; i < 4; i += 2) {
    level2.push(hash2(level1[i], level1[i + 1]));
  }

  const root = hash2(level2[0], level2[1]);

  // Path for leaf index 0 (all left turns)
  const pathElements = [leaves[1], level1[1], level2[1]];
  const pathIndices  = ["0", "0", "0"];

  // Circuit input — recipientHash is now a PRIVATE input
  const input = {
    secret,
    nullifier,
    pathElements,
    pathIndices,
    recipientHash,   // private in V3
  };

  const note = {
    version: "growthip-merkle-note-v3",
    secret,
    nullifier,
    recipientId,
    commitment,
    nullifierHash,
    recipientHash,
    root,
    leafIndex: 0,
    pathElements,
    pathIndices,
    warning:
      "Testnet demo note. Keep secret/nullifier/recipientHash private. " +
      "V3: recipientHash is cryptographically bound inside commitment.",
  };

  fs.writeFileSync(
    path.join("circuits", "growthip_merkle_note_v3_input.json"),
    JSON.stringify(input, null, 2)
  );

  fs.mkdirSync(buildDir, { recursive: true });

  fs.writeFileSync(
    path.join(buildDir, "growthip_merkle_note_v3_demo_note.json"),
    JSON.stringify(note, null, 2)
  );

  console.log("=== Growthip Merkle V3 input generated ===");
  console.log("secret       :", secret);
  console.log("nullifier    :", nullifier);
  console.log("commitment   :", commitment);
  console.log("nullifierHash:", nullifierHash);
  console.log("recipientHash:", recipientHash);
  console.log("root         :", root);
  console.log("");
  console.log("Generated:");
  console.log("  circuits/growthip_merkle_note_v3_input.json");
  console.log("  circuits/build/growthip_merkle_note_v3_demo_note.json");
  console.log("");
  console.log("IMPORTANT: recipientHash is now a PRIVATE input in V3.");
  console.log("The commitment binds secret + nullifier + recipientHash.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});