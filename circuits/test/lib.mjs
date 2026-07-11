// Shared helpers for the transaction2x2 circuit tests.
//
// Hashing goes through the compiled Poseidon2 witness calculators (the same
// vendored templates the main circuit includes), so every value here is
// bit-identical to what the circuit computes by construction. Baby Jubjub
// arithmetic comes from circomlibjs (already a Growthip dependency).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBabyjub } from "circomlibjs";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(CIRCUITS_DIR, "build");

export const BN254_P =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const SUBGROUP_L =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;
export const DEPTH = 20;

// Domain tags (must match transaction2x2.circom header)
export const DOM = {
  COMMIT: 0x01n,
  NULLIFIER: 0x02n,
  PKD: 0x05n,
  NK: 0x06n,
  AK: 0x07n,
  IVK: 0x10n,
  RD: 0x11n,
};

async function calculator(name) {
  const wc = require(join(BUILD, `${name}_js`, "witness_calculator.js"));
  const wasm = readFileSync(join(BUILD, `${name}_js`, `${name}.wasm`));
  return wc(wasm);
}

let h1W, h2W, h3W, compressW, babyjub;

export async function initCrypto() {
  [h1W, h2W, h3W, compressW, babyjub] = await Promise.all([
    calculator("poseidon2_1_main"),
    calculator("poseidon2_2_main"),
    calculator("poseidon2_3_main"),
    calculator("poseidon2_compress_main"),
    buildBabyjub(),
  ]);
}

export const p2_1 = async (a, dom) =>
  (await h1W.calculateWitness({ inputs: [a], dom }, true))[1];
export const p2_2 = async (a, b, dom) =>
  (await h2W.calculateWitness({ inputs: [a, b], dom }, true))[1];
export const p2_3 = async (a, b, c, dom) =>
  (await h3W.calculateWitness({ inputs: [a, b, c], dom }, true))[1];
export const compress = async (l, r) =>
  (await compressW.calculateWitness({ inputs: [l, r] }, true))[1];

export function mulBase(scalar) {
  const P = babyjub.mulPointEscalar(babyjub.Base8, scalar);
  return { x: babyjub.F.toObject(P[0]), y: babyjub.F.toObject(P[1]) };
}

// Deterministic pseudo-random field elements for reproducible tests.
let seedCounter = 1000n;
export const pseudoRandom = (mod = BN254_P) => {
  seedCounter += 0x9e3779b97f4a7c15n;
  let x = seedCounter;
  x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & ((1n << 64n) - 1n);
  x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & ((1n << 64n) - 1n);
  // widen to ~256 bits
  return ((x << 192n) ^ (x << 128n) ^ (x << 64n) ^ x) % mod;
};

// Full Sapling-style key chain, mirroring the in-circuit derivation.
export async function makeKeys(ask, nsk, d = 0n) {
  const ak = mulBase(ask);
  const nk = mulBase(nsk);
  const akFold = await p2_2(ak.x, ak.y, DOM.AK);
  const nkFold = await p2_2(nk.x, nk.y, DOM.NK);
  const ivk = (await p2_2(akFold, nkFold, DOM.IVK)) % SUBGROUP_L;
  const rd = (await p2_1(d, DOM.RD)) % SUBGROUP_L;
  const pkd = mulBase((ivk * rd) % SUBGROUP_L);
  return { ask, nsk, d, ak, nk, akFold, nkFold, ivk, rd, pkd };
}

export const randomKeys = async (d = 0n) =>
  makeKeys(pseudoRandom(SUBGROUP_L), pseudoRandom(SUBGROUP_L), d);

export async function noteCommitment(amount, pkd, blinding) {
  const pkdFold = await p2_2(pkd.x, pkd.y, DOM.PKD);
  return p2_3(amount, pkdFold, blinding, DOM.COMMIT);
}

export const nullifierOf = (commitment, pathIndices, nkFold) =>
  p2_3(commitment, pathIndices, nkFold, DOM.NULLIFIER);

// Append-only depth-20 Merkle tree, leaf zero = 0 (the vault convention,
// pinned by parity tests: empty root 119827e7...3680).
export class MerkleTree {
  constructor() {
    this.leaves = [];
    this.zeros = null;
  }
  async init() {
    this.zeros = [0n];
    for (let i = 0; i < DEPTH; i++) {
      const z = this.zeros[i];
      this.zeros.push(await compress(z, z));
    }
  }
  insert(leaf) {
    this.leaves.push(leaf);
    return this.leaves.length - 1;
  }
  async node(level, index) {
    if (level === 0) {
      return index < this.leaves.length ? this.leaves[index] : 0n;
    }
    // whole subtree empty -> zero hash, no recursion needed
    if (index * 2 ** level >= this.leaves.length) return this.zeros[level];
    const l = await this.node(level - 1, 2 * index);
    const r = await this.node(level - 1, 2 * index + 1);
    return compress(l, r);
  }
  root() {
    return this.node(DEPTH, 0);
  }
  async path(leafIndex) {
    const elements = [];
    let idx = leafIndex;
    for (let level = 0; level < DEPTH; level++) {
      elements.push(await this.node(level, idx ^ 1));
      idx >>= 1;
    }
    return { pathElements: elements, pathIndices: BigInt(leafIndex) };
  }
}

// Field-encode a signed public amount: negatives wrap to p - |x|.
export const publicAmount = (signed) =>
  signed >= 0n ? signed : BN254_P - -signed;

// A dummy input note: amount 0, real keys, zero path; skips only the root check.
export async function dummyInput(root) {
  const keys = await randomKeys();
  const blinding = pseudoRandom();
  const commitment = await noteCommitment(0n, keys.pkd, blinding);
  const nullifier = await nullifierOf(commitment, 0n, keys.nkFold);
  return {
    keys,
    input: {
      nullifier,
      amount: 0n,
      ask: keys.ask,
      nsk: keys.nsk,
      d: keys.d,
      blinding,
      pathIndices: 0n,
      pathElements: Array(DEPTH).fill(0n),
    },
  };
}

// A real input note that lives in the tree at leafIndex.
export async function realInput(tree, keys, amount, blinding, leafIndex) {
  const commitment = await noteCommitment(amount, keys.pkd, blinding);
  const { pathElements, pathIndices } = await tree.path(leafIndex);
  const nullifier = await nullifierOf(commitment, pathIndices, keys.nkFold);
  return {
    commitment,
    nullifier,
    amount,
    ask: keys.ask,
    nsk: keys.nsk,
    d: keys.d,
    blinding,
    pathIndices,
    pathElements,
  };
}

export async function makeOutput(amount, pkd, blinding = pseudoRandom()) {
  return {
    commitment: await noteCommitment(amount, pkd, blinding),
    amount,
    pkd,
    blinding,
  };
}

// Assemble the full witness-input object in the circuit's signal names.
export function txInput({ root, pubAmount, extDataHash, domain, ins, outs }) {
  return {
    root,
    publicAmount: pubAmount,
    extDataHash,
    domain,
    inputNullifier: ins.map((i) => i.nullifier),
    inAmount: ins.map((i) => i.amount),
    inAsk: ins.map((i) => i.ask),
    inNsk: ins.map((i) => i.nsk),
    inD: ins.map((i) => i.d),
    inBlinding: ins.map((i) => i.blinding),
    inPathIndices: ins.map((i) => i.pathIndices),
    inPathElements: ins.map((i) => i.pathElements),
    outputCommitment: outs.map((o) => o.commitment),
    outAmount: outs.map((o) => o.amount),
    outPubkeyAx: outs.map((o) => o.pkd.x),
    outPubkeyAy: outs.map((o) => o.pkd.y),
    outBlinding: outs.map((o) => o.blinding),
  };
}
