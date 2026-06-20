// Same conversion logic as convert_growthip_merkle_note_v3_snarkjs.js,
// adapted for the V3.1 circuit which has 4 public inputs
// (root, nullifierHash, recipientHashOut, index) instead of 3.

const fs   = require("fs");
const path = require("path");

const buildDir = path.join("circuits", "build");

const vk = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v3_1_verification_key.json"),
    "utf8"
  )
);

const proof = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v3_1_proof.json"),
    "utf8"
  )
);

const publicInputs = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v3_1_public.json"),
    "utf8"
  )
);

if (vk.protocol !== "groth16") {
  throw new Error(`Expected groth16 VK, got ${vk.protocol}`);
}
if (proof.protocol !== "groth16") {
  throw new Error(`Expected groth16 proof, got ${proof.protocol}`);
}
if (vk.curve !== "bn128" || proof.curve !== "bn128") {
  throw new Error(`Expected bn128 curve. VK=${vk.curve}, proof=${proof.curve}`);
}
if (!Array.isArray(vk.IC)) {
  throw new Error("verification_key.json does not contain IC array");
}
if (Number(vk.nPublic) !== publicInputs.length) {
  throw new Error(
    `nPublic mismatch. VK=${vk.nPublic}, public=${publicInputs.length}`
  );
}
// V3.1 must have exactly 4 public inputs: root, nullifierHash, recipientHash, index
if (publicInputs.length !== 4) {
  throw new Error(
    `Expected 4 public inputs for V3.1, got ${publicInputs.length}`
  );
}

function g1(point) {
  return { x: point[0], y: point[1] };
}
function g2(point) {
  return {
    x1: point[0][1],
    x2: point[0][0],
    y1: point[1][1],
    y2: point[1][0],
  };
}

const parameters = {
  version: "growthip-merkle-note-v3-1",
  curve: "bn128",
  protocol: "groth16",
  public_inputs_len: Number(vk.nPublic),
  verification_key: {
    alpha: g1(vk.vk_alpha_1),
    beta:  g2(vk.vk_beta_2),
    gamma: g2(vk.vk_gamma_2),
    delta: g2(vk.vk_delta_2),
    IC:    vk.IC.map(g1),
  },
  metadata: {
    circuit:        "growthip_merkle_note_v3_1.circom",
    public_outputs: ["root", "nullifierHash", "recipientHashOut", "index"],
    private_inputs: ["secret", "nullifier", "pathElements", "pathIndices", "recipientHash"],
    note: "V3.1: adds `index` as a 4th public output, derived from pathIndices bits, " +
          "so the pool contract can look up the actual deposited amount at claim time " +
          "instead of a flat base unit. G2 points: snarkjs [real, imag] -> Soroban [imag, real].",
  },
};

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v3_1_parameters.json"),
  JSON.stringify(parameters, null, 2)
);

function to32ByteHex(decimalString) {
  const hex = BigInt(decimalString).toString(16);
  if (hex.length > 64) {
    throw new Error(`Field element too large: ${decimalString}`);
  }
  return hex.padStart(64, "0");
}

function g1Hex(point) {
  return to32ByteHex(point[0]) + to32ByteHex(point[1]);
}

function g2Hex(point) {
  return (
    to32ByteHex(point[0][1]) +
    to32ByteHex(point[0][0]) +
    to32ByteHex(point[1][1]) +
    to32ByteHex(point[1][0])
  );
}

const proofHex =
  g1Hex(proof.pi_a) +
  g2Hex(proof.pi_b) +
  g1Hex(proof.pi_c);

if (proofHex.length !== 512) {
  throw new Error(`Expected proof hex length 512, got ${proofHex.length}`);
}

const publicInputsHex = publicInputs.map(to32ByteHex).join("");

if (publicInputsHex.length !== 256) {
  throw new Error(
    `Expected public inputs hex length 256 (4x64), got ${publicInputsHex.length}`
  );
}

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v3_1_proof_abc.hex"),
  proofHex
);
fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v3_1_public_inputs.hex"),
  publicInputsHex
);
fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v3_1_public_inputs.json"),
  JSON.stringify(publicInputs, null, 2)
);

console.log("=== Converted Growthip Merkle note V3.1 artifacts ===");
console.log(`nPublic         : ${vk.nPublic}`);
console.log(`IC length       : ${vk.IC.length}`);
console.log(`Proof bytes     : ${proofHex.length / 2}`);
console.log(`Public inputs   : ${publicInputs.length}`);
console.log(`Public values   : ${JSON.stringify(publicInputs)}`);
console.log("");
console.log("Generated:");
console.log("  circuits/build/growthip_merkle_note_v3_1_parameters.json");
console.log("  circuits/build/growthip_merkle_note_v3_1_proof_abc.hex");
console.log("  circuits/build/growthip_merkle_note_v3_1_public_inputs.hex");
console.log("  circuits/build/growthip_merkle_note_v3_1_public_inputs.json");