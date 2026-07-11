// Growthip V5 shielded key hierarchy (Sapling-style), seed-agnostic core.
//
//   seed (32+ bytes, caller-provided)
//     -> ask = wideToScalar(seed, "gr:ask")     spend authorizing scalar, in [0, L)
//     -> nsk = wideToScalar(seed, "gr:nsk")     nullifier scalar, in [0, L)
//     -> ovk = deriveBytes(seed, "gr:ovk")      outgoing viewing key (32 bytes)
//     -> ak  = ask . Base8                      Baby Jubjub points
//     -> nk  = nsk . Base8
//     -> akFold = Poseidon2([ak.x, ak.y], 0x07)
//     -> nkFold = Poseidon2([nk.x, nk.y], 0x06)
//     -> ivk = Poseidon2([akFold, nkFold], 0x10) mod L
//     -> rd  = Poseidon2([dField(d)], 0x11) mod L
//     -> pkD = (ivk * rd mod L) . Base8         == ivk . (rd . Base8), the circuit's form
//
// Domain tags are FROZEN by transaction2x2.circom (Day 2): 0x01 commit,
// 0x02 nullifier, 0x05 pk_d, 0x06 nk, 0x07 ak, 0x10 ivk, 0x11 r_d. Never
// re-derive new tag numbers client-side.
//
// SEED SOURCING is deliberately OUTSIDE this module. The caller decides whether
// the seed comes from a BIP39 mnemonic, a deterministic wallet signature, or a
// stored secret. This keeps the crypto core pure, dependency-light, and
// testable, and keeps V4's key infrastructure untouched.
//
// On ReduceModL parity: the circuit's ReduceModL constrains out == in mod L
// with a bounded quotient witness (k in [0,8), special-cased at k = 7). That
// machinery exists for CONSTRAINT soundness in the field; the mathematical
// value is plain `in mod L`, which native BigInt `%` computes exactly for the
// non-negative in < p range. This equivalence is not assumed — it is proven by
// circuits/test/keychain-parity.test.mjs against the vendored circuit gadgets.

import { sha256 } from "@noble/hashes/sha2.js";
import { SUBGROUP_ORDER, mulBase, type Point } from "./babyjub";
import { poseidon2 } from "./poseidon2";
import { bytesToBigInt, concatBytes } from "./hex";

export const DOM = {
  COMMIT: 0x01,
  NULLIFIER: 0x02,
  PKD: 0x05,
  NK: 0x06,
  AK: 0x07,
  IVK: 0x10,
  RD: 0x11,
} as const;

/** Default diversifier: 11 zero bytes -> one canonical address per wallet. */
export const DEFAULT_DIVERSIFIER: Uint8Array = new Uint8Array(11);

export interface ShieldedKeys {
  ask: bigint; // spend authorizing scalar, canonical in [0, L)
  nsk: bigint; // nullifier scalar, canonical in [0, L)
  ovk: Uint8Array; // outgoing viewing key (32 bytes)
  ak: Point;
  nk: Point;
  akFold: bigint;
  nkFold: bigint; // cached: needed for every nullifier computation
  ivk: bigint; // incoming viewing key scalar, in [0, L)
  d: Uint8Array; // diversifier
  pkD: Point; // diversified transmission key (the address point)
}

const enc = new TextEncoder();

function assertCanonicalScalar(name: string, s: bigint): void {
  if (s < 0n || s >= SUBGROUP_ORDER) {
    throw new Error(`${name} out of range [0, L) — non-canonical scalar`);
  }
}

/** sha256(seed || tag) as raw bytes (for ovk and similar byte-keys). */
export function deriveBytes(seed: Uint8Array, tag: string): Uint8Array {
  return sha256(concatBytes(seed, enc.encode(tag)));
}

/**
 * Wide-reduce 512 bits mod L: two domain-separated sha256 halves concatenated,
 * then reduced. The 512-bit headroom over ~2^251 keeps the reduction unbiased
 * (naive 256-bit mod L would bias low scalars). Same construction as the
 * reference wallet, retagged for gr.
 */
export function wideToScalar(seed: Uint8Array, tag: string): bigint {
  const t = enc.encode(tag);
  const h0 = sha256(concatBytes(seed, t, Uint8Array.of(0)));
  const h1 = sha256(concatBytes(seed, t, Uint8Array.of(1)));
  const s = ((bytesToBigInt(h0) << 256n) | bytesToBigInt(h1)) % SUBGROUP_ORDER;
  return s;
}

/** Field-encode a diversifier (big-endian bytes -> bigint). */
export const dField = (d: Uint8Array): bigint => bytesToBigInt(d);

/**
 * pk_d for a diversifier. Single-mult form (ivk*rd mod L) . Base8 equals the
 * circuit's ivk . (rd . Base8) — proven by the keychain parity test.
 */
export async function diversifiedKey(ivk: bigint, d: Uint8Array): Promise<Point> {
  const rd = (await poseidon2([dField(d)], DOM.RD)) % SUBGROUP_ORDER;
  return mulBase((ivk * rd) % SUBGROUP_ORDER);
}

/**
 * Derives the full gr key hierarchy from a seed. `account` > 0 appends the
 * index to every tag for an independent identity from the same seed.
 */
export async function deriveShieldedKeys(
  seed: Uint8Array,
  account = 0,
  d: Uint8Array = DEFAULT_DIVERSIFIER,
): Promise<ShieldedKeys> {
  if (seed.length < 32) throw new Error("seed must be at least 32 bytes");
  if (!Number.isInteger(account) || account < 0) throw new Error("invalid account index");
  if (d.length !== 11) throw new Error("diversifier must be exactly 11 bytes");

  const tag = (base: string): string => (account === 0 ? base : `${base}/${account}`);

  const ask = wideToScalar(seed, tag("gr:ask"));
  const nsk = wideToScalar(seed, tag("gr:nsk"));
  // AssertLtL equivalent: canonical by construction (% L), enforced anyway.
  assertCanonicalScalar("ask", ask);
  assertCanonicalScalar("nsk", nsk);
  const ovk = deriveBytes(seed, tag("gr:ovk"));

  const ak = await mulBase(ask);
  const nk = await mulBase(nsk);
  const akFold = await poseidon2([ak[0], ak[1]], DOM.AK);
  const nkFold = await poseidon2([nk[0], nk[1]], DOM.NK);
  const ivk = (await poseidon2([akFold, nkFold], DOM.IVK)) % SUBGROUP_ORDER;
  const pkD = await diversifiedKey(ivk, d);

  return { ask, nsk, ovk, ak, nk, akFold, nkFold, ivk, d, pkD };
}
