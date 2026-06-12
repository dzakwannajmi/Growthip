const fs = require("fs");
const path = require("path");

const buildDir = path.join("circuits", "build");

const vk = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v2_verification_key.json"),
    "utf8"
  )
);

const proof = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v2_proof.json"),
    "utf8"
  )
);

const publicInputs = JSON.parse(
  fs.readFileSync(
    path.join(buildDir, "growthip_merkle_note_v2_public.json"),
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

function g1(point) {
  return {
    x: point[0],
    y: point[1],
  };
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
  version: "growthip-merkle-note-v2-recipient-binding",
  curve: "bn128",
  protocol: "groth16",
  public_inputs_len: Number(vk.nPublic),
  verification_key: {
    alpha: g1(vk.vk_alpha_1),
    beta: g2(vk.vk_beta_2),
    gamma: g2(vk.vk_gamma_2),
    delta: g2(vk.vk_delta_2),
    IC: vk.IC.map(g1),
  },
  metadata: {
    circuit: "growthip_merkle_note_v2.circom",
    public_outputs: ["root", "nullifierHash", "recipientHash"],
    private_inputs: ["secret", "nullifier", "pathElements", "pathIndices"],
    note: "G2 points converted from snarkjs [real, imaginary] order into Soroban [imaginary, real] order.",
  },
};

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v2_parameters.json"),
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

const proofHex = g1Hex(proof.pi_a) + g2Hex(proof.pi_b) + g1Hex(proof.pi_c);

if (proofHex.length !== 512) {
  throw new Error(`Expected proof hex length 512, got ${proofHex.length}`);
}

const publicInputsHex = publicInputs.map(to32ByteHex).join("");

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v2_proof_abc.hex"),
  proofHex
);

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v2_public_inputs.hex"),
  publicInputsHex
);

fs.writeFileSync(
  path.join(buildDir, "growthip_merkle_note_v2_public_inputs.json"),
  JSON.stringify(publicInputs, null, 2)
);

console.log("Converted Growthip Merkle note v2 artifacts.");
console.log(`nPublic: ${vk.nPublic}`);
console.log(`IC length: ${vk.IC.length}`);
console.log(`Proof bytes: ${proofHex.length / 2}`);
console.log(`Public inputs count: ${publicInputs.length}`);
console.log(`Public inputs: ${JSON.stringify(publicInputs)}`);
console.log("");
console.log("Generated:");
console.log("- circuits/build/growthip_merkle_note_v2_parameters.json");
console.log("- circuits/build/growthip_merkle_note_v2_proof_abc.hex");
console.log("- circuits/build/growthip_merkle_note_v2_public_inputs.hex");
console.log("- circuits/build/growthip_merkle_note_v2_public_inputs.json");
