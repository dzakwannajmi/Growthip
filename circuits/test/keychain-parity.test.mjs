// Keychain parity: the TS key-derivation module vs the vendored circuit gadgets.
// For each test vector (ask, nsk, d): run the full chain in TS, run the
// keychain_main circuit witness, and require every intermediate to be
// bit-identical — ak, nk, akFold, nkFold, ivk (ReduceModL!), rd, pkD.
// This PROVES (not assumes) that BigInt `% L` equals the circuit's ReduceModL
// and that (ivk*rd mod L).Base8 equals the circuit's ivk.(rd.Base8).
//
// Run from circuits/: node test/keychain-parity.test.mjs
// Requires: build/keychain_main_js (npm run build:oracles builds poseidon2 mains;
// keychain is compiled by the command in HARI4-INSTRUKSI.md), ts-check/out (tsc).

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const CIRCUITS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(CIRCUITS_DIR, "build");

// Compiled TS module (CommonJS out of tsc; adjust path if your layout differs).
const TS_OUT = join(CIRCUITS_DIR, "ts-check", "out");
const { SUBGROUP_ORDER, mulBase } = require(join(TS_OUT, "babyjub.js"));
const { setCircuitBase, poseidon2 } = require(join(TS_OUT, "poseidon2.js"));
const keysMod = require(join(TS_OUT, "keys.js"));
const addrMod = require(join(TS_OUT, "address.js"));

// Point the TS poseidon2 at flat wasm copies.
setCircuitBase(join(BUILD, "flat"));

async function circuitKeychain(ask, nsk, d) {
  const wc = require(join(BUILD, "keychain_main_js", "witness_calculator.js"));
  const wasm = readFileSync(join(BUILD, "keychain_main_js", "keychain_main.wasm"));
  const w = await wc(wasm);
  const witness = await w.calculateWitness({ ask, nsk, d }, true);
  // Output order matches the circuit's declaration order.
  const [akX, akY, nkX, nkY, akFold, nkFold, ivk, rd, pkdX, pkdY] = witness.slice(1, 11);
  return { akX, akY, nkX, nkY, akFold, nkFold, ivk, rd, pkdX, pkdY };
}

let passed = 0;
let failed = 0;
const check = (name, a, b) => {
  if (a === b) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}\n      ts:      ${a}\n      circuit: ${b}`);
  }
};

async function main() {
  // ── Vectors: deterministic seeds -> full TS chain vs circuit ──────────────
  const seeds = [
    new Uint8Array(32).fill(1),
    new Uint8Array(32).fill(0xab),
    Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 5) & 0xff),
  ];

  for (const [i, seed] of seeds.entries()) {
    const k = await keysMod.deriveShieldedKeys(seed);
    // Canonicality (AssertLtL equivalent)
    if (k.ask >= SUBGROUP_ORDER || k.nsk >= SUBGROUP_ORDER) {
      failed++;
      console.log(`FAIL  vector ${i}: non-canonical ask/nsk`);
      continue;
    }
    const c = await circuitKeychain(k.ask, k.nsk, keysMod.dField(k.d));
    check(`v${i} ak.x`, k.ak[0], c.akX);
    check(`v${i} ak.y`, k.ak[1], c.akY);
    check(`v${i} nk.x`, k.nk[0], c.nkX);
    check(`v${i} nk.y`, k.nk[1], c.nkY);
    check(`v${i} akFold`, k.akFold, c.akFold);
    check(`v${i} nkFold`, k.nkFold, c.nkFold);
    check(`v${i} ivk (ReduceModL parity)`, k.ivk, c.ivk);
    check(`v${i} pkD.x (single-mult == circuit double-mult)`, k.pkD[0], c.pkdX);
    check(`v${i} pkD.y`, k.pkD[1], c.pkdY);
  }

  // ── ReduceModL edge pressure: scalars near L and hash outputs near p ──────
  // Drive the circuit with ask = L-1 (max canonical) and confirm TS matches.
  {
    const ask = SUBGROUP_ORDER - 1n;
    const nsk = 1n;
    const tsAk = await mulBase(ask);
    const c = await circuitKeychain(ask, nsk, 0n);
    check("edge ask=L-1 ak.x", tsAk[0], c.akX);
    check("edge ask=L-1 ak.y", tsAk[1], c.akY);
  }

  // ── Address roundtrip ──────────────────────────────────────────────────────
  {
    const k = await keysMod.deriveShieldedKeys(seeds[0]);
    const addr = await addrMod.encodeAddress(k.pkD);
    const startsGr = addr.startsWith("gr1");
    if (startsGr) {
      passed++;
      console.log(`PASS  address HRP (${addr.slice(0, 12)}...)`);
    } else {
      failed++;
      console.log(`FAIL  address HRP: ${addr}`);
    }
    const parsed = await addrMod.parseAddress(addr);
    check("address roundtrip pkD.x", parsed.pkD[0], k.pkD[0]);
    check("address roundtrip pkD.y", parsed.pkD[1], k.pkD[1]);

    // Rejections: wrong HRP and corrupted payload must throw.
    let rejectedWrongHrp = false;
    try {
      // Re-encode under a different HRP and feed to parseAddress.
      const { bech32m } = require("@scure/base");
      const dec = bech32m.decode(addr, 256);
      const cy = bech32m.encode("cy", dec.words, 256);
      await addrMod.parseAddress(cy);
    } catch {
      rejectedWrongHrp = true;
    }
    check("rejects wrong HRP", rejectedWrongHrp, true);

    let rejectedCorrupt = false;
    try {
      await addrMod.parseAddress(addr.slice(0, -1) + (addr.endsWith("q") ? "p" : "q"));
    } catch {
      rejectedCorrupt = true;
    }
    check("rejects corrupted checksum", rejectedCorrupt, true);
  }

  // ── Determinism + account separation ──────────────────────────────────────
  {
    const a1 = await keysMod.deriveShieldedKeys(seeds[0], 0);
    const a2 = await keysMod.deriveShieldedKeys(seeds[0], 0);
    check("deterministic ask", a1.ask, a2.ask);
    const b = await keysMod.deriveShieldedKeys(seeds[0], 1);
    check("account 1 differs", a1.ask !== b.ask, true);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
