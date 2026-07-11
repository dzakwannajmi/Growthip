// gr shielded receiving addresses: bech32m over a versioned payload.
//   default:     0x00 || packPoint(pkD)              (33 bytes)
//   diversified: 0x01 || d(11 bytes) || packPoint(pkD) (44 bytes)
// Adapted from fxjrin/cyphras wallet.ts address section (Apache-2.0), HRP cy->gr.

import { bech32m } from "@scure/base";
import { inSubgroup, packPoint, unpackPoint, type Point } from "./babyjub";
import { DEFAULT_DIVERSIFIER } from "./keys";

export const HRP = "gr";
const BECH32_LIMIT = 256;
const VERSION_DEFAULT = 0x00;
const VERSION_DIVERSIFIED = 0x01;

/**
 * Encodes a receiving address. Uses the compact default form when the
 * diversifier is all-zero, the diversified form otherwise.
 */
export async function encodeAddress(
  pkD: Point,
  d: Uint8Array = DEFAULT_DIVERSIFIER,
): Promise<string> {
  const packed = await packPoint(pkD);
  const isDefault = d.every((b) => b === 0);
  const payload = isDefault
    ? new Uint8Array([VERSION_DEFAULT, ...packed])
    : new Uint8Array([VERSION_DIVERSIFIED, ...d, ...packed]);
  return bech32m.encode(HRP, bech32m.toWords(payload), BECH32_LIMIT);
}

/**
 * Decodes and validates a gr address. Rejects wrong HRP, malformed payloads,
 * off-curve points, and points outside the prime-order subgroup — a malformed
 * address must be unpayable, not silently accepted.
 */
export async function parseAddress(addr: string): Promise<{ d: Uint8Array; pkD: Point }> {
  let payload: Uint8Array;
  try {
    const dec = bech32m.decode(addr.trim().toLowerCase() as `${string}1${string}`, BECH32_LIMIT);
    if (dec.prefix !== HRP) throw new Error(`wrong prefix "${dec.prefix}"`);
    payload = bech32m.fromWords(dec.words);
  } catch (e) {
    throw new Error("invalid gr address (" + (e as Error).message + ")");
  }
  let d: Uint8Array;
  let packed: Uint8Array;
  if (payload[0] === VERSION_DEFAULT && payload.length === 33) {
    d = new Uint8Array(11);
    packed = Uint8Array.from(payload.slice(1, 33));
  } else if (payload[0] === VERSION_DIVERSIFIED && payload.length === 44) {
    d = Uint8Array.from(payload.slice(1, 12));
    packed = Uint8Array.from(payload.slice(12, 44));
  } else {
    throw new Error("unsupported gr address version/length");
  }
  const pkD = await unpackPoint(packed);
  if (!pkD) throw new Error("invalid point in gr address");
  if (!(await inSubgroup(pkD))) throw new Error("gr address point not in the prime-order subgroup");
  return { d, pkD };
}
