/**
 * poseidon.ts
 *
 * Browser-side Poseidon hashing for Growthip V3 (BN254 / circomlib).
 *
 * All field elements are represented as DECIMAL strings (BigInt.toString()),
 * matching the circuit input format and `scripts/make_growthip_merkle_input_v3.js`.
 *
 * Hash arities used by the V3 circuit:
 *   - hash1(x)       = Poseidon([x])          -> nullifierHash, recipientHash
 *   - hash2(x, y)    = Poseidon([x, y])       -> Merkle level hashing
 *   - hash3(x, y, z) = Poseidon([x, y, z])    -> commitment
 *
 * IMPORTANT: circomlibjs Poseidon constants MUST match the constants baked
 * into the compiled circuit. Do not swap hashing libraries.
 */

import { buildPoseidon } from "circomlibjs";
import { StrKey } from "@stellar/stellar-sdk";

/** BN254 scalar field prime (r). All field elements live in [0, BN254_PRIME). */
export const BN254_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** circomlibjs Poseidon is async to build; cache a single instance. */
type PoseidonFn = ((inputs: Array<bigint | string | number>) => unknown) & {
  F: { toString: (x: unknown) => string };
};

let poseidonInstance: PoseidonFn | null = null;
let poseidonPromise: Promise<PoseidonFn> | null = null;

/**
 * Lazily build (and cache) the Poseidon hasher.
 * Safe to call repeatedly; the heavy WASM init runs only once.
 */
async function getPoseidon(): Promise<PoseidonFn> {
  if (poseidonInstance) return poseidonInstance;
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon() as Promise<PoseidonFn>;
  }
  poseidonInstance = await poseidonPromise;
  return poseidonInstance;
}

/** Normalize any field-ish input into a reduced bigint in [0, BN254_PRIME). */
function toFieldBigInt(value: bigint | string): bigint {
  const v = typeof value === "bigint" ? value : BigInt(value);
  const reduced = v % BN254_PRIME;
  return reduced < 0n ? reduced + BN254_PRIME : reduced;
}

/** Poseidon over `inputs`, returning the result as a decimal string. */
async function poseidonDecimal(
  inputs: Array<bigint | string>,
): Promise<string> {
  const poseidon = await getPoseidon();
  const args = inputs.map(toFieldBigInt);
  const out = poseidon(args);
  // F.toString returns a base-10 decimal string for the field element.
  return poseidon.F.toString(out);
}

/** hash1 — single-input Poseidon. */
export async function hash1(a: bigint | string): Promise<string> {
  return poseidonDecimal([a]);
}

/** hash2 — two-input Poseidon (used for Merkle level hashing). */
export async function hash2(
  a: bigint | string,
  b: bigint | string,
): Promise<string> {
  return poseidonDecimal([a, b]);
}

/** hash3 — three-input Poseidon (used for the V3 commitment). */
export async function hash3(
  a: bigint | string,
  b: bigint | string,
  c: bigint | string,
): Promise<string> {
  return poseidonDecimal([a, b, c]);
}

/**
 * V3 commitment = Poseidon(secret, nullifier, recipientHash).
 * Returns a decimal string.
 */
export async function computeCommitment(
  secret: string,
  nullifier: string,
  recipientHash: string,
): Promise<string> {
  return hash3(secret, nullifier, recipientHash);
}

/**
 * nullifierHash = Poseidon(nullifier).
 * Returns a decimal string.
 */
export async function computeNullifierHash(
  nullifier: string,
): Promise<string> {
  return hash1(nullifier);
}

/**
 * recipientHash = Poseidon(recipientId), where
 *   recipientId = BigInt(ed25519_pubkey_bytes) mod BN254_PRIME
 *
 * The ed25519 public key (32 bytes) is decoded from a Stellar public address
 * (G... base32). Reducing mod the field prime guarantees a valid field element.
 *
 * This MUST be identical at register-time and at proof-generation-time.
 * The contract only compares the registered recipientHash against the
 * recipientHash exposed by the proof, so this formula need not match any
 * on-chain hashing logic — only itself.
 *
 * @param walletAddress Stellar public address, e.g. "GABC...".
 * @returns recipientHash as a decimal string.
 */
export async function computeRecipientHash(
  walletAddress: string,
): Promise<string> {
  if (!StrKey.isValidEd25519PublicKey(walletAddress)) {
    throw new Error(
      `Invalid Stellar public address: ${walletAddress.slice(0, 8)}...`,
    );
  }
  // 32-byte ed25519 public key.
  const raw = StrKey.decodeEd25519PublicKey(walletAddress);
  let hex = "";
  for (const b of raw) hex += b.toString(16).padStart(2, "0");
  const recipientId = (BigInt("0x" + hex) % BN254_PRIME).toString();
  return hash1(recipientId);
}

/**
 * Generate a random field element as a decimal string.
 * Uses 31 random bytes (248 bits), which stays safely below BN254_PRIME,
 * so no rejection sampling is needed. Mirrors `randomFieldDecimal()` in
 * `scripts/make_growthip_merkle_input_v3.js`.
 */
function randomFieldDecimal(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + hex).toString();
}

/** Random secret as a decimal string. */
export function generateSecret(): string {
  return randomFieldDecimal();
}

/** Random nullifier as a decimal string. */
export function generateNullifier(): string {
  return randomFieldDecimal();
}

/** Eagerly warm the Poseidon WASM (optional; e.g. on wallet connect). */
export async function warmPoseidon(): Promise<void> {
  await getPoseidon();
}