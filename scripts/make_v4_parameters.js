// Convert v4 vk_params.json (hex) to parameters.json (decimal) for Rust build.rs
const fs = require("fs");
const path = require("path");

const vkParams = JSON.parse(
  fs.readFileSync("circuits/build/v4/vk_params.json", "utf8")
);
const vk = JSON.parse(
  fs.readFileSync("circuits/build/v4/verification_key_v4.json", "utf8")
);

// Use decimal values directly from snarkjs verification_key.json
// G1: [x, y, "1"] (projective), G2: [[x1,x2],[y1,y2],["1","0"]]

function g1Decimal(p) {
  return { x: p[0], y: p[1] };
}

function g2Decimal(p) {
  return { x1: p[0][0], x2: p[0][1], y1: p[1][0], y2: p[1][1] };
}

const params = {
  version: "growthip_merkle_note_v4",
  curve: "bn128",
  protocol: "groth16",
  public_inputs_len: vk.nPublic,
  verification_key: {
    alpha: g1Decimal(vk.vk_alpha_1),
    beta:  g2Decimal(vk.vk_beta_2),
    gamma: g2Decimal(vk.vk_gamma_2),
    delta: g2Decimal(vk.vk_delta_2),
    IC: vk.IC.map(g1Decimal),
  }
};

const outPath = "contracts/growthip-merkle-verifier-v4/parameters.json";
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(params, null, 2));
console.log("OK: parameters.json written to", outPath);
console.log("public_inputs_len:", vk.nPublic);
console.log("IC length:", vk.IC.length);
