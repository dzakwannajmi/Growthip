// gr identity seed sourcing — DECISION: Option A (dedicated BIP39 mnemonic).
//
// Why not wallet-signature-derived seeds (Option B): on Stellar, message
// signing is generic — ANY site can ask the user to sign the exact same fixed
// message, so a deterministic signature over a fixed string is phishable seed
// material: one signature on a malicious site = full gr spend authority stolen.
// Additionally, cross-wallet signature determinism (Freighter vs xBull) is
// unverified, and there is no independent recovery path. For a shielded pool,
// key loss means FUND loss (notes locked to the old pkD are unrecoverable —
// unlike V4 note-encryption, where rotateIdentity() restores future function),
// so the root of funds must be user-held and wallet-independent: a mnemonic.
//
// Simplification vs V4's dual-wrap: the mnemonic IS the deterministic root
// (mnemonic -> seed -> deriveShieldedKeys), so recovery = re-enter mnemonic.
// Daily use: wrap the 64-byte seed under the password with the same AES-GCM
// pattern as keyManagement.ts and store only wrapped bytes in IndexedDB.
//
// IMPORTANT: this mnemonic is SEPARATE from the V4 note-encryption recovery
// phrase. Never reuse one for the other (independent compromise blast radius),
// and label them distinctly in the UI.

import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** 128 bits -> 12 words, matching V4's RECOVERY_PHRASE_STRENGTH_BITS. */
export const GR_MNEMONIC_STRENGTH_BITS = 128;

/** Generates a fresh gr identity mnemonic (12 English words). */
export function newGrMnemonic(): string {
  return bip39.generateMnemonic(wordlist, GR_MNEMONIC_STRENGTH_BITS);
}

export function isValidGrMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(mnemonic.trim().toLowerCase(), wordlist);
}

/**
 * Derives the 64-byte seed for deriveShieldedKeys(). Standard BIP39 PBKDF2
 * with an empty passphrase — the password protects the STORED wrapped seed
 * (AES-GCM), not the derivation, so recovery needs only the 12 words.
 */
export function grSeedFromMnemonic(mnemonic: string): Uint8Array {
  const m = mnemonic.trim().toLowerCase();
  if (!bip39.validateMnemonic(m, wordlist)) {
    throw new Error("invalid gr recovery phrase");
  }
  return bip39.mnemonicToSeedSync(m);
}
