const fs = require("fs");
const path = require("path");

const buildDir = path.join("circuits", "build");

const vk = JSON.parse(fs.readFileSync(path.join(buildDir, "verification_key.json"), "utf8"));
const proof = JSON.parse(fs.readFileSync(path.join(buildDir, "proof.json"), "utf8"));
const publicInputs = JSON.parse(fs.readFileSync(path.join(buildDir, "public.json"), "utf8"));

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
  throw new Error(`nPublic mismatch. VK=${vk.nPublic}, public.json=${publicInputs.length}`);
}

// snarkjs G1 format: [x, y, z]
// We only need affine x, y.
function g1(point) {
  return {
    x: point[0],
    y: point[1],
  };
}

// snarkjs G2 format:
// [
//   [x_re, x_im],
//   [y_re, y_im],
//   [1, 0]
// ]
//
// Nethermind/Soroban template expects:
// x1 = x_im
// x2 = x_re
// y1 = y_im
// y2 = y_re
function g2(point) {
  return {
    x1: point[0][1],
    x2: point[0][0],
    y1: point[1][1],
    y2: point[1][0],
  };
}

const squareParameters = {
  version: "square-0.1.0",
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
    source: "snarkjs verification_key.json",
    note: "G2 points converted from snarkjs [real, imaginary] order into Soroban/RISC0-template [imaginary, real] order.",
  },
};

fs.writeFileSync(
  path.join(buildDir, "square_parameters.json"),
  JSON.stringify(squareParameters, null, 2)
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
  // Soroban/RISC0 template proof byte order:
  // x_im || x_re || y_im || y_re
  return (
    to32ByteHex(point[0][1]) +
    to32ByteHex(point[0][0]) +
    to32ByteHex(point[1][1]) +
    to32ByteHex(point[1][0])
  );
}

// Proof byte layout expected by the audited template:
// A(G1 64B) || B(G2 128B) || C(G1 64B) = 256 bytes.
const proofHex = g1Hex(proof.pi_a) + g2Hex(proof.pi_b) + g1Hex(proof.pi_c);

if (proofHex.length !== 512) {
  throw new Error(`Expected proof hex length 512, got ${proofHex.length}`);
}

fs.writeFileSync(path.join(buildDir, "proof_abc.hex"), proofHex);
fs.writeFileSync(
  path.join(buildDir, "public_inputs.json"),
  JSON.stringify(publicInputs, null, 2)
);

console.log("Converted snarkjs artifacts for Soroban verifier experiment.");
console.log(`nPublic: ${vk.nPublic}`);
console.log(`IC length: ${vk.IC.length}`);
console.log(`Proof bytes: ${proofHex.length / 2}`);
console.log(`Public inputs: ${JSON.stringify(publicInputs)}`);
console.log("");
console.log("Generated:");
console.log("- circuits/build/square_parameters.json");
console.log("- circuits/build/proof_abc.hex");
console.log("- circuits/build/public_inputs.json");
