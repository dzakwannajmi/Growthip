/**
 * addressId.ts
 *
 * Cosmetic obfuscation of Stellar addresses for shareable tip links.
 *
 * IMPORTANT — what this is and is NOT:
 * This is NOT cryptographic privacy. It is a reversible, publicly
 * computable transform (anyone can decode an ID back to the address —
 * that's required, since the supporter's browser must resolve it to
 * know where to send a tip). Its only purpose is to avoid pasting a raw
 *56-character Stellar address into a public-facing URL, which:
 *   - looks less "crypto-wallet-y" when shared casually (Twitter bio, etc.)
 *   - avoids casual copy-paste of the creator's address into a block
 *     explorer by someone who stumbles on the link
 *
 * The creator's real address is STILL fully visible on-chain the moment
 * they call register_recipient() or claim_to() — this does not and
 * cannot hide that. See SECURITY.md for the honest accounting of what
 * is and isn't private in Growthip.
 */

import { StrKey } from "@stellar/stellar-sdk";

const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Encode a Uint8Array as a base62 string. */
function bytesToBase62(bytes: Uint8Array): string {
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) | BigInt(b);
  }
  if (value === 0n) return "0";
  let out = "";
  while (value > 0n) {
    const rem = Number(value % 62n);
    out = BASE62_ALPHABET[rem] + out;
    value = value / 62n;
  }
  return out;
}

/** Decode a base62 string back into a Uint8Array of the given byte length. */
function base62ToBytes(s: string, byteLength: number): Uint8Array {
  let value = 0n;
  for (const ch of s) {
    const idx = BASE62_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error(`Invalid character in tip ID: ${ch}`);
    value = value * 62n + BigInt(idx);
  }
  const bytes = new Uint8Array(byteLength);
  for (let i = byteLength - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

/**
 * Encodes a Stellar G... address into a shorter, cosmetic tip-link ID.
 * Reversible via decodeTipId(). Throws if the address is invalid.
 */
export function encodeTipId(stellarAddress: string): string {
  if (!StrKey.isValidEd25519PublicKey(stellarAddress)) {
    throw new Error(`Invalid Stellar address: ${stellarAddress.slice(0, 8)}...`);
  }
  const raw = StrKey.decodeEd25519PublicKey(stellarAddress); // 32 raw bytes
  return bytesToBase62(raw);
}

/**
 * Decodes a tip-link ID back into a Stellar G... address.
 * Throws if the ID is malformed or doesn't decode to a valid address.
 */
export function decodeTipId(tipId: string): string {
  const raw = base62ToBytes(tipId, 32);
  const address = StrKey.encodeEd25519PublicKey(Buffer.from(raw));
  if (!StrKey.isValidEd25519PublicKey(address)) {
    throw new Error("Tip link is invalid or corrupted.");
  }
  return address;
}