// Convert V4 circuit verification key + proof to Rust/Soroban format
const fs   = require("fs");
const path = require("path");

const buildDir = path.join("circuits", "build", "v4");

const vk = JSON.parse(fs.readFileSync(path.join(buildDir, "verification_key_v4.json"), "utf8"));
const proof = JSON.parse(fs.readFileSync(path.join(buildDir, "growthip_merkle_note_v4_proof.json"), "utf8"));
const pub = JSON.parse(fs.readFileSync(path.join(buildDir, "growthip_merkle_note_v4_public.json"), "utf8"));

function g1ToHex(p) {
  const x = BigInt(p[0]).toString(16).padStart(64, "0");
  const y = BigInt(p[1]).toString(16).padStart(64, "0");
  return x + y;
}

function g2ToHex(p) {
  // G2 points: x = [x1, x0], y = [y1, y0] — snarkjs stores [c1, c0]
  const x1 = BigInt(p[0][0]).toString(16).padStart(64, "0");
  const x0 = BigInt(p[0][1]).toString(16).padStart(64, "0");
  const y1 = BigInt(p[1][0]).toString(16).padStart(64, "0");
  const y0 = BigInt(p[1][1]).toString(16).padStart(64, "0");
  return x1 + x0 + y1 + y0;
}

function fieldToHex(s) {
  return BigInt(s).toString(16).padStart(64, "0");
}

console.log("=== Converted Growthip Merkle note V4 artifacts ===");
console.log("nPublic         :", vk.nPublic);
console.log("IC length       :", vk.IC.length);

// Proof bytes: pi_a (G1, 64B) + pi_b (G2, 128B) + pi_c (G1, 64B) = 256B
const proofBytes = g1ToHex(proof.pi_a) + g2ToHex(proof.pi_b) + g1ToHex(proof.pi_c);
console.log("Proof bytes     :", proofBytes.length / 2);
console.log("Public inputs   :", pub.length);

// VK parameters for Rust
console.log("\n=== VK Parameters (for Rust verifier) ===");
console.log("alpha_g1:", g1ToHex(vk.vk_alpha_1));
console.log("beta_g2 :", g2ToHex(vk.vk_beta_2));
console.log("gamma_g2:", g2ToHex(vk.vk_gamma_2));
console.log("delta_g2:", g2ToHex(vk.vk_delta_2));
console.log("IC[0]   :", g1ToHex(vk.IC[0]));
for (let i = 1; i < vk.IC.length; i++) {
  console.log(`IC[${i}]   :`, g1ToHex(vk.IC[i]));
}

console.log("\n=== Test proof bytes (hex) ===");
console.log(proofBytes);

console.log("\n=== Test public inputs (hex) ===");
const pubHex = pub.map(fieldToHex).join("");
console.log(pubHex);

// Save to files for Rust
fs.writeFileSync(path.join(buildDir, "proof_bytes.hex"), proofBytes);
fs.writeFileSync(path.join(buildDir, "public_inputs.hex"), pubHex);
fs.writeFileSync(path.join(buildDir, "vk_params.json"), JSON.stringify({
  alpha_g1: g1ToHex(vk.vk_alpha_1),
  beta_g2:  g2ToHex(vk.vk_beta_2),
  gamma_g2: g2ToHex(vk.vk_gamma_2),
  delta_g2: g2ToHex(vk.vk_delta_2),
  ic: vk.IC.map(g1ToHex),
}, null, 2));

console.log("\nFiles saved to circuits/build/v4/");
