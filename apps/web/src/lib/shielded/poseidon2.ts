// Poseidon2 over BN254, run through the same circom witness calculators as the
// circuit, so the TS hash is bit-identical to the in-circuit hash by
// construction (the Day-2 decision: witness-calculator WASM as hash oracle).
// Arities 1/2/3; the vendored round constants cover t in {2,3,4}.
// Vendored from fxjrin/cyphras extension/src/shielded/poseidon2.ts (Apache-2.0).
import * as snarkjs from "snarkjs";

// Base path holding poseidon2_{1,2,3}_main.wasm.
// Next.js: serve from public/, default "/circuits". Node tests override this.
let base = "/circuits";
export function setCircuitBase(path: string): void {
  base = path;
}
export function circuitBase(): string {
  return base;
}

export async function poseidon2(inputs: bigint[], dom: number): Promise<bigint> {
  if (inputs.length < 1 || inputs.length > 3) {
    throw new Error(`no Poseidon2 helper for ${inputs.length} inputs`);
  }
  const wasm = `${base}/poseidon2_${inputs.length}_main.wasm`;
  const wtns: { type: string } = { type: "mem" };
  await snarkjs.wtns.calculate({ inputs: inputs.map(String), dom: String(dom) }, wasm, wtns);
  return ((await snarkjs.wtns.exportJson(wtns)) as bigint[])[1];
}

// PoseidonCompress (2-input, no domain separator) — used for Merkle internal
// node hashing (merkleProof.circom / merkle_onchain_v2.rs), NOT the same
// circuit as poseidon2() above which is for commitment/nullifier/fold hashes
// with a mandatory domain-separator input. Do not conflate the two: they use
// different .circom templates and different .wasm witness calculators.
export async function poseidon2Compress(left: bigint, right: bigint): Promise<bigint> {
  const wasm = `${base}/poseidon2_compress_main.wasm`;
  const wtns: { type: string } = { type: "mem" };
  await snarkjs.wtns.calculate({ inputs: [String(left), String(right)] }, wasm, wtns);
  return ((await snarkjs.wtns.exportJson(wtns)) as bigint[])[1];
}
