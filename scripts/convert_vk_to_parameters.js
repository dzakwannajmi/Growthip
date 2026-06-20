// Converts a snarkjs-exported verification_key.json into the
// parameters.json format expected by growthip-merkle-verifier-v3's
// build.rs.
//
// Mapping verified against the EXISTING (already-working) V3 circuit's
// parameters.json, by comparing field values directly:
//
//   G1 point [x, y, "1"]  -> { x, y }
//
//   G2 point [[a,b],[c,d],["1","0"]] -> { x1: b, x2: a, y1: d, y2: c }
//     (snarkjs stores G2 coords as [im, re] pairs per component;
//      parameters.json's x1/y1 = imaginary part, x2/y2 = real part)

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error("Usage: node convert_vk_to_parameters.js <verification_key.json> <circuit_name> <output_parameters.json>");
  process.exit(1);
}

const [vkPath, circuitName, outPath] = args;

const vk = JSON.parse(fs.readFileSync(vkPath, "utf8"));

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

const params = {
  version: circuitName,
  curve: "bn128",
  protocol: "groth16",
  public_inputs_len: vk.nPublic,
  verification_key: {
    alpha: g1(vk.vk_alpha_1),
    beta: g2(vk.vk_beta_2),
    gamma: g2(vk.vk_gamma_2),
    delta: g2(vk.vk_delta_2),
    IC: vk.IC.map(g1),
  },
  metadata: {
    circuit: circuitName + ".circom",
    public_outputs: ["root", "nullifierHash", "recipientHashOut", "index"],
  },
};

fs.writeFileSync(outPath, JSON.stringify(params, null, 2));
console.log(`Written ${outPath}`);
console.log(`public_inputs_len: ${params.public_inputs_len}`);
console.log(`IC length: ${params.verification_key.IC.length} (should be public_inputs_len + 1)`);