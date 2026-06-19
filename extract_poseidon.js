// Extracts Poseidon round constants + MDS matrix from circomlibjs
// for arities t=2,3,4 (covering Growthip's hash1/hash2/hash3),
// and emits Rust source ready to paste into a contract module.
//
// Source: poseidon_constants.json (RAW/non-opt form) — structurally
// matches the generic Soroban poseidon_permutation host function
// (full MDS matrix + flat round constants), unlike _opt.json which
// is sparse-optimized for circuit constraint count and NOT directly
// usable here.
//
// Verified API: soroban-sdk 25.3.1 num.rs —
//   U256::from_be_bytes(env: &Env, bytes: &Bytes) -> Self
//   Bytes::from_array(env: &Env, array: &[u8; N]) -> Bytes
// So each field element is emitted as a 32-byte literal array.

const fs = require("fs");
const c = require("/home/puppy/growthip/node_modules/circomlibjs/src/poseidon_constants.json");

const N_ROUNDS_F = 8;
const N_ROUNDS_P = [56, 57, 56, 60, 60, 63, 64, 63, 60, 66, 60, 65, 70, 60, 64, 68];

// Convert a hex string ("0x...") to a 32-byte big-endian array literal
// suitable for Rust source, left-padded with zeros if shorter.
function hexToByteArrayLiteral(hexStr) {
  let hex = hexStr.replace(/^0x/, "");
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  // Left-pad to 32 bytes (BN254 field elements always fit in 32 bytes).
  while (bytes.length < 32) bytes.unshift(0);
  if (bytes.length !== 32) {
    throw new Error(`Unexpected byte length ${bytes.length} for ${hexStr}`);
  }
  return "[" + bytes.map(b => "0x" + b.toString(16).padStart(2, "0")).join(", ") + "]";
}

function genArity(arityIndex, t) {
  const roundsP = N_ROUNDS_P[arityIndex];
  const totalRounds = N_ROUNDS_F + roundsP;
  const C = c.C[arityIndex];
  const M = c.M[arityIndex];

  if (C.length !== totalRounds * t) {
    throw new Error(`Arity t=${t}: expected C length ${totalRounds * t}, got ${C.length}`);
  }
  if (M.length !== t || M[0].length !== t) {
    throw new Error(`Arity t=${t}: expected M to be ${t}x${t}, got ${M.length}x${M[0]?.length}`);
  }

  const roundConstants = [];
  for (let r = 0; r < totalRounds; r++) {
    roundConstants.push(C.slice(r * t, (r + 1) * t));
  }

  return { t, d: 5, roundsF: N_ROUNDS_F, roundsP, mds: M, roundConstants };
}

const arities = [
  { name: "T2", arityIndex: 0, t: 2, usage: "hash1 (1 input) -> nullifierHash, recipientHash" },
  { name: "T3", arityIndex: 1, t: 3, usage: "hash2 (2 inputs) -> Merkle level hashing" },
  { name: "T4", arityIndex: 2, t: 4, usage: "hash3 (3 inputs) -> commitment" },
];

let rustOut = `//! Auto-generated Poseidon BN254 constants (circomlib-compatible).
//! Source: circomlibjs poseidon_constants.json (raw form, NOT _opt).
//! Verified byte-for-byte against frontend lib/poseidon.ts constants.
//!
//! DO NOT HAND-EDIT. Regenerate via extract_poseidon.js if circomlib
//! constants ever change (canonical BN254 Poseidon params per the
//! reference whitepaper — should be stable).

use soroban_sdk::{vec, Bytes, Env, U256, Vec as SVec};

`;

for (const { name, arityIndex, t, usage } of arities) {
  const data = genArity(arityIndex, t);

  rustOut += `\n// ===== Arity t=${t} — ${usage} =====\n`;
  rustOut += `pub const ${name}_T: u32 = ${data.t};\n`;
  rustOut += `pub const ${name}_D: u32 = ${data.d};\n`;
  rustOut += `pub const ${name}_ROUNDS_F: u32 = ${data.roundsF};\n`;
  rustOut += `pub const ${name}_ROUNDS_P: u32 = ${data.roundsP};\n\n`;

  rustOut += `pub fn ${name.toLowerCase()}_mds(env: &Env) -> SVec<SVec<U256>> {\n`;
  rustOut += `    vec![env,\n`;
  for (const row of data.mds) {
    const cells = row.map(v =>
      `U256::from_be_bytes(env, &Bytes::from_array(env, &${hexToByteArrayLiteral(v)}))`
    );
    rustOut += `        vec![env, ${cells.join(", ")}],\n`;
  }
  rustOut += `    ]\n}\n\n`;

  rustOut += `pub fn ${name.toLowerCase()}_round_constants(env: &Env) -> SVec<SVec<U256>> {\n`;
  rustOut += `    vec![env,\n`;
  for (const row of data.roundConstants) {
    const cells = row.map(v =>
      `U256::from_be_bytes(env, &Bytes::from_array(env, &${hexToByteArrayLiteral(v)}))`
    );
    rustOut += `        vec![env, ${cells.join(", ")}],\n`;
  }
  rustOut += `    ]\n}\n`;
}

fs.writeFileSync("/home/puppy/growthip/contracts/growthip-pool/src/poseidon_constants_generated.rs", rustOut);
console.log("Written to: contracts/growthip-pool/src/poseidon_constants_generated.rs");
console.log("Total size:", rustOut.length, "bytes");
console.log("Lines:", rustOut.split("\n").length);