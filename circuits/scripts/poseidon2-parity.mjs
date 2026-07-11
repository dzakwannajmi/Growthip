#!/usr/bin/env node
// Poseidon2 circom<->host-function parity checker for Growthip V5.
//
// Compiles the parity mini-circuits (circuits/parity/*.circom) against the
// vendored templates (circuits/lib/poseidon2/*.circom), computes witness
// outputs, and compares them against the locked reference vectors — the same
// vectors pinned in contracts/poseidon2/src/parity_test.rs. Both sides passing
// proves the on-chain CAP-0075 path and the in-circuit path are bit-identical.
//
// Usage (from repo root or anywhere):
//   node circuits/scripts/poseidon2-parity.mjs
// Requires: circom 2.2.2 in PATH, node >= 18.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CIRCUITS_DIR = resolve(SCRIPT_DIR, "..");
const PARITY_DIR = join(CIRCUITS_DIR, "parity");
const BUILD_DIR = join(CIRCUITS_DIR, "build", "parity");

// ── Locked reference vectors (MUST stay in sync with parity_test.rs) ─────────
const EXPECTED = {
  "compress(7,11)":
    "0960972bcfa9d858be6a1cca2c850d2eb0e5df1ad309192beeb95f8be328945f",
  "compress(0,0)":
    "228981b886e5effb2c05a6be7ab4a05fde6bf702a2d039e46c87057dd729ef97",
  "compress(1,2)":
    "0e90c132311e864e0c8bca37976f28579a2dd9436bbc11326e21ec7c00cea5b3",
  "hash2(1,2,dom=0)":
    "2afac3bdc3663b71eefeecdf21b147d0ba7dd7a169a7757c05ed6bfb065bffd2",
  "hash2(1,2,dom=1)":
    "2c50c6e642d5c7c8b35947a5f00e1391dc443b17b7bb6dc5d6bc19350b6dfcb4",
  "hash2(7,11,dom=7)":
    "0350adb33ac11489fb4732e35f459326b1a2323919c0e592a1014a581d33112f",
  "zeroes[0] = P2_3([88,76,77],dom=0)":
    "25302288db99350344974183ce310d63b53abb9ef0f8575753eed36e0118f9ce",
  "empty root depth-20 (leaf zero = 0)":
    "119827e780a1850d7b7e34646edc1ce918211c26dda4e13bcd1611f6f81c3680",
};

const MAINS = [
  "poseidon2_compress_main",
  "poseidon2_2_main",
  "poseidon2_3_main",
];

const hex = (v) => BigInt(v).toString(16).padStart(64, "0");

function compile() {
  mkdirSync(BUILD_DIR, { recursive: true });
  for (const m of MAINS) {
    execFileSync(
      "circom",
      [join(PARITY_DIR, `${m}.circom`), "--wasm", "-o", BUILD_DIR, "-l", CIRCUITS_DIR],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  }
}

async function calculator(name) {
  const wcPath = join(BUILD_DIR, `${name}_js`, "witness_calculator.js");
  const wasm = readFileSync(join(BUILD_DIR, `${name}_js`, `${name}.wasm`));
  const wc = require(wcPath);
  return wc(wasm);
}

async function main() {
  console.log("compiling parity circuits...");
  compile();

  const compressW = await calculator("poseidon2_compress_main");
  const h2W = await calculator("poseidon2_2_main");
  const h3W = await calculator("poseidon2_3_main");

  const compress = async (l, r) =>
    (await compressW.calculateWitness({ inputs: [l, r] }, true))[1];
  const hash2 = async (a, b, dom) =>
    (await h2W.calculateWitness({ inputs: [a, b], dom }, true))[1];
  const hash3 = async (a, b, c, dom) =>
    (await h3W.calculateWitness({ inputs: [a, b, c], dom }, true))[1];

  const actual = {};
  actual["compress(7,11)"] = hex(await compress(7n, 11n));
  actual["compress(0,0)"] = hex(await compress(0n, 0n));
  actual["compress(1,2)"] = hex(await compress(1n, 2n));
  actual["hash2(1,2,dom=0)"] = hex(await hash2(1n, 2n, 0n));
  actual["hash2(1,2,dom=1)"] = hex(await hash2(1n, 2n, 1n));
  actual["hash2(7,11,dom=7)"] = hex(await hash2(7n, 11n, 7n));
  actual["zeroes[0] = P2_3([88,76,77],dom=0)"] = hex(await hash3(88n, 76n, 77n, 0n));

  let z = 0n;
  for (let i = 0; i < 20; i++) z = await compress(z, z);
  actual["empty root depth-20 (leaf zero = 0)"] = hex(z);

  let failed = 0;
  for (const [label, want] of Object.entries(EXPECTED)) {
    const got = actual[label];
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) console.log(`      want ${want}\n      got  ${got}`);
  }

  if (failed > 0) {
    console.error(`\n${failed} vector(s) FAILED — circom lib and locked vectors diverge.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(EXPECTED).length} vectors match — circom side is parity-locked.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
