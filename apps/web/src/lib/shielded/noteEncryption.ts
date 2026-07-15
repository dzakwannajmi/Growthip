// Note encryption over Baby Jubjub ECDH for Growthip V5.
//
// Adapted from fxjrin/cyphras extension/src/shielded/crypto.ts (Apache-2.0),
// with Buffer replaced by browser-safe helpers (same treatment as Day 4).
//
// Cannot reuse V4's X25519/AES-GCM/HKDF stack: the gr system lives on Baby
// Jubjub (ask/nsk/ak/nk/ivk/pkD), and Web Crypto's X25519 is Curve25519 — a
// different, incompatible curve. So ECDH runs on Baby Jubjub via babyjub.ts,
// and the KDF is a domain-separated sha256 over the packed shared secret.
//
// Scheme (Sapling-style):
//   sender:    esk <- random scalar; epk = esk . g_d; shared = esk . pk_d
//   recipient: shared = ivk . epk
//   identity:  ivk . epk = ivk . (esk . g_d) = esk . (ivk . g_d) = esk . pk_d  ✓
// The identity ONLY holds because epk is built on g_d (the diversifier base),
// NOT on Base8. This is the easy-to-get-wrong part; keep it exactly.
//
// One deliberate DIVERGENCE from Zcash and a note on ovk: we do NOT implement an
// outgoing-viewing-key path. A sender's own change output goes back to their own
// pk_d, so their normal ivk trial-decrypt already finds it — no separate ovk
// channel needed. ShieldedKeys.ovk therefore stays unused; that is a conscious
// scope decision for the hackathon, not an oversight.

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  type Point,
  SUBGROUP_ORDER,
  mulBase,
  mulPoint,
  packPoint,
  unpackPoint,
  inSubgroup,
  randScalar,
} from "./babyjub";
import { poseidon2 } from "./poseidon2";
import { DOM } from "./keys";
import { bytesToBigInt, concatBytes } from "./hex";

/** 32-byte big-endian encoding of a field element. */
function u256be(x: bigint): Uint8Array {
  const h = x.toString(16).padStart(64, "0");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

const dField = (d: Uint8Array): bigint => bytesToBigInt(d);

// Domain separates this KDF from any other sha256 use in the system.
const KDF_DOMAIN = new TextEncoder().encode("growthip-note-v1-bjj");
const kdf = (sharedPacked: Uint8Array, epkPacked: Uint8Array): Uint8Array =>
  sha256(concatBytes(sharedPacked, epkPacked, KDF_DOMAIN));

// Plaintext is FIXED 75 bytes (amount 32 || d 11 || blinding 32) so every
// encrypted_output is equal-size and leaks no length information.
const PT_LEN = 75;
const EPK_LEN = 32;
const NONCE_LEN = 24;
const TAG_LEN = 16;
export const CIPHERTEXT_LEN = EPK_LEN + NONCE_LEN + PT_LEN + TAG_LEN; // 147

/**
 * Encrypt (amount, d, blinding) to a recipient's pk_d with diversifier d.
 * Layout: packPoint(epk)(32) || nonce(24) || xchacha_ct(75 + 16 tag).
 * `d` must be the SAME diversifier that produced pkD (default = 11 zero bytes).
 */
export async function encryptNoteForRecipient(
  pkD: Point,
  d: Uint8Array,
  amount: bigint,
  blinding: bigint,
): Promise<Uint8Array> {
  if (d.length !== 11) throw new Error("diversifier must be exactly 11 bytes");
  if (amount < 0n || blinding < 0n) throw new Error("amount/blinding must be non-negative");

  const rd = (await poseidon2([dField(d)], DOM.RD)) % SUBGROUP_ORDER;
  const gd = await mulBase(rd);
  const esk = randScalar();
  const epk = await mulPoint(gd, esk); // esk . g_d  (NOT esk . Base8)

  const shared = await mulPoint(pkD, esk); // esk . pk_d
  const epkPacked = await packPoint(epk);
  const key = kdf(await packPoint(shared), epkPacked);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const pt = concatBytes(u256be(amount), d, u256be(blinding));
  const ct = xchacha20poly1305(key, nonce).encrypt(pt);
  return concatBytes(epkPacked, nonce, ct);
}

/**
 * Try to decrypt an encrypted_output with the wallet's ivk. Returns null (never
 * throws) when the note is not ours or was tampered with — so a scan loop can
 * trial-decrypt every event cheaply.
 */
export async function tryDecryptNote(
  ivk: bigint,
  blob: Uint8Array,
): Promise<{ amount: bigint; d: Uint8Array; blinding: bigint } | null> {
  if (blob.length !== CIPHERTEXT_LEN) return null;
  try {
    const epkPacked = Uint8Array.from(blob.slice(0, EPK_LEN));
    const nonce = blob.slice(EPK_LEN, EPK_LEN + NONCE_LEN);
    const ct = blob.slice(EPK_LEN + NONCE_LEN);
    const epk = await unpackPoint(epkPacked);

    if (epk) {
    }
    // Reject off-subgroup epk BEFORE the ECDH: a small-order epk could force a
    // predictable shared secret.
    if (!epk || !(await inSubgroup(epk))) return null;
    const shared = await mulPoint(epk, ivk); // ivk . epk == esk . pk_d
    const key = kdf(await packPoint(shared), epkPacked);
    const pt = xchacha20poly1305(key, nonce).decrypt(ct); // throws on bad tag
    if (pt.length !== PT_LEN) return null;
    return {
      amount: bytesToBigInt(pt.slice(0, 32)),
      d: Uint8Array.from(pt.slice(32, 43)),
      blinding: bytesToBigInt(pt.slice(43, 75)),
    };
  } catch {
    return null;
  }
}
