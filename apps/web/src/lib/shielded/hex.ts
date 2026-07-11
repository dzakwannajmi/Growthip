// Browser-safe hex/bigint helpers. Replaces the reference implementation's
// Buffer usage (Node-only) so the module runs unpolyfilled in Next.js clients.

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

export function bytesToBigInt(b: Uint8Array): bigint {
  if (b.length === 0) return 0n;
  return BigInt("0x" + bytesToHex(b));
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}
