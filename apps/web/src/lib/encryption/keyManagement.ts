/**
 * keyManagement.ts
 *
 * High-level orchestration for Growthip's private-note encryption
 * identity: creation, unlock (via password or recovery phrase), session
 * lifecycle (auto-lock), and encrypted backup export/import.
 *
 * DESIGN NOTE -- where the non-extractable CryptoKey actually lives:
 * It is NEVER written to IndexedDB. storage.ts persists only the
 * AES-GCM-WRAPPED (encrypted) private key bytes. The actual usable,
 * non-extractable CryptoKey exists ONLY in this module's in-memory
 * session state, for the duration of an unlocked session, and is
 * discarded (set to null) on lock/timeout/tab close. This sidesteps any
 * question of whether a given browser correctly structured-clones
 * non-extractable EC CryptoKey objects into IndexedDB (a historically
 * inconsistent area across browsers) -- we simply never ask IndexedDB to
 * store one.
 *
 * This module must only ever run client-side (it touches Worker,
 * IndexedDB, and crypto.subtle). Callers in Next.js must be in a
 * "use client" component/module.
 */

import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import {
  generateX25519KeyPair,
  exportPublicKeyRaw,
  exportPrivateKeyPkcs8,
  importPrivateKeyNonExtractable,
  importPublicKeyRaw,
  deriveSharedSecretBits,
  deriveAesKeyFromSharedSecret,
  wrapKeyBytes,
  unwrapKeyBytes,
  importWrappingKey,
  aesGcmEncrypt,
  aesGcmDecrypt,
  generateRandomBytes,
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
} from "./cryptoUtils";
import { saveIdentity, loadIdentity, hasIdentity, deleteIdentity, type StoredIdentity, type KdfParams } from "./storage";
import type { KdfRequest, KdfResponse } from "./kdfWorker";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Argon2id parameters -- see Phase 2 discussion. parallelism is honestly
 * set to 1: argon2-browser does not actually compute in parallel in
 * normal browser contexts, so claiming otherwise via a higher number
 * would be a false sense of security, not a real one. */
const KDF_PARAMS: KdfParams = {
  time: 3,
  mem: 65536, // 64 MB, in KiB
  parallelism: 1,
  hashLen: 32, // bytes -- exactly enough for an AES-256 key
};

/** Session auto-locks after this many milliseconds of no unlock-requiring
 * activity. Resets on every successful decrypt operation. */
const AUTO_LOCK_MS = 15 * 60 * 1000; // 15 minutes

const RECOVERY_PHRASE_STRENGTH_BITS = 128; // -> 12 words

/* ------------------------------------------------------------------ */
/* Session state (module-scoped, in-memory only, never persisted)      */
/* ------------------------------------------------------------------ */

let sessionPrivateKey: CryptoKey | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

function clearSession(): void {
  sessionPrivateKey = null;
  if (autoLockTimer !== null) {
    clearTimeout(autoLockTimer);
    autoLockTimer = null;
  }
}

function resetAutoLockTimer(): void {
  if (autoLockTimer !== null) clearTimeout(autoLockTimer);
  autoLockTimer = setTimeout(() => {
    clearSession();
  }, AUTO_LOCK_MS);
}

export function isUnlocked(): boolean {
  return sessionPrivateKey !== null;
}

export function lockSession(): void {
  clearSession();
}

/* ------------------------------------------------------------------ */
/* Argon2id worker wrapper                                             */
/* ------------------------------------------------------------------ */

/**
 * Runs Argon2id in a dedicated Worker and resolves with the raw hash
 * bytes. A fresh Worker is spun up per call and terminated afterward --
 * this is a deliberately simple, stateless pattern appropriate for an
 * operation that happens rarely (unlock, setup), not a hot path that
 * would benefit from a persistent worker pool.
 *
 * NEEDS BROWSER VERIFICATION: this relies on Next.js/Webpack's native
 * `new Worker(new URL(...))` resolution working correctly for a
 * TypeScript worker file, and on argon2-browser's WASM asset loading
 * correctly from within that worker's module context. Both should be
 * confirmed with a real build + browser test before this is trusted,
 * per the Phase 2 review notes.
 */
function runArgon2idInWorker(secret: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Web Workers are not available in this environment."));
      return;
    }

    const worker = new Worker(new URL("./kdfWorker.ts", import.meta.url));
    const requestId = crypto.randomUUID();

    const timeoutHandle = setTimeout(() => {
      worker.terminate();
      reject(new Error("Argon2id derivation timed out."));
    }, 30_000);

    worker.onmessage = (event: MessageEvent<KdfResponse>) => {
      if (event.data.requestId !== requestId) return; // stale/foreign message
      clearTimeout(timeoutHandle);
      worker.terminate();
      if (event.data.ok) {
        resolve(event.data.hash);
      } else {
        reject(new Error(`Argon2id derivation failed: ${event.data.error}`));
      }
    };

    worker.onerror = (event) => {
      clearTimeout(timeoutHandle);
      worker.terminate();
      reject(new Error(`Worker error during key derivation: ${event.message}`));
    };

    const request: KdfRequest = { requestId, secret, salt, params };
    worker.postMessage(request);
  });
}

/* ------------------------------------------------------------------ */
/* Unlock                                                               */
/* ------------------------------------------------------------------ */

async function unlockWithSecret(
  secret: string,
  wrappedBytes: Uint8Array,
  wrapIv: Uint8Array,
  kdfSalt: Uint8Array,
  kdfParams: KdfParams,
): Promise<void> {
  const derivedHash = await runArgon2idInWorker(secret, kdfSalt, kdfParams);
  const wrappingKey = await importWrappingKey(derivedHash);

  let privateKeyBytes: Uint8Array;
  try {
    privateKeyBytes = await unwrapKeyBytes(wrappingKey, wrapIv, wrappedBytes);
  } catch {
    // AES-GCM authentication failure surfaces here as a generic
    // DOMException from crypto.subtle.decrypt -- normalize it to a
    // clear, user-facing message rather than leaking Web Crypto
    // internals to the UI layer.
    throw new Error("Incorrect password or recovery phrase.");
  }

  sessionPrivateKey = await importPrivateKeyNonExtractable(privateKeyBytes);
  resetAutoLockTimer();
}

export async function unlockWithPassword(password: string): Promise<void> {
  const identity = await loadIdentity();
  if (!identity) throw new Error("No encryption identity found in this browser.");

  await unlockWithSecret(
    password,
    identity.wrappedByPassword,
    identity.passwordWrapIv,
    identity.passwordKdfSalt,
    identity.passwordKdfParams,
  );
}

/* ------------------------------------------------------------------ */
/* Note encryption / decryption                                        */
/* ------------------------------------------------------------------ */

/**
 * Wire format for an encrypted note bundle, embedded in a shareable URL
 * or QR code (never sent through any backend -- Growthip has none):
 *   ephemeralPublicKey (32 bytes) || hkdfSalt (16 bytes) || iv (12 bytes) || ciphertext (variable, includes 16-byte GCM tag)
 * Base64url-encoded as a whole for URL embedding.
 */
const EPHEMERAL_PUBKEY_LEN = 32;
const HKDF_SALT_LEN = 16;
const IV_LEN = 12;

/**
 * Encrypts a plaintext note for a specific recipient's public key.
 * Called from the SUPPORTER's side -- requires no local identity/session
 * of their own, only the creator's public key (read from
 * growthip-creator-registry on-chain).
 *
 * Generates a fresh ephemeral X25519 keypair per call (never reused),
 * standard ECIES-style construction: the ephemeral public key travels
 * alongside the ciphertext so the recipient can redo the same ECDH on
 * their end with their long-lived private key.
 */
export async function encryptNoteForRecipient(
  recipientPublicKeyRaw: Uint8Array,
  plaintextNote: Uint8Array,
): Promise<string> {
  const recipientPublicKey = await importPublicKeyRaw(recipientPublicKeyRaw);
  const ephemeralKeyPair = await generateX25519KeyPair();
  const ephemeralPublicKeyRaw = await exportPublicKeyRaw(ephemeralKeyPair.publicKey);

  const sharedSecretBits = await deriveSharedSecretBits(
    ephemeralKeyPair.privateKey,
    recipientPublicKey,
  );

  const hkdfSalt = generateRandomBytes(HKDF_SALT_LEN);
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecretBits, hkdfSalt);
  const { iv, ciphertext } = await aesGcmEncrypt(aesKey, plaintextNote);

  const bundle = new Uint8Array(
    EPHEMERAL_PUBKEY_LEN + HKDF_SALT_LEN + IV_LEN + ciphertext.length,
  );
  let offset = 0;
  bundle.set(ephemeralPublicKeyRaw, offset);
  offset += EPHEMERAL_PUBKEY_LEN;
  bundle.set(hkdfSalt, offset);
  offset += HKDF_SALT_LEN;
  bundle.set(iv, offset);
  offset += IV_LEN;
  bundle.set(ciphertext, offset);

  return bytesToBase64Url(bundle);
}

/**
 * Decrypts an incoming note bundle using the CURRENT UNLOCKED SESSION's
 * private key. Throws if the session is locked -- callers must prompt
 * for unlock first (isUnlocked() / unlockWithPassword() /
 * unlockWithRecoveryPhrase()).
 *
 * Resets the auto-lock timer on success, treating a successful decrypt
 * as "activity" that extends the session.
 */
export async function decryptIncomingNote(bundleBase64Url: string): Promise<Uint8Array> {
  if (sessionPrivateKey === null) {
    throw new Error("Encryption session is locked. Unlock before decrypting notes.");
  }

  const bundle = base64UrlToBytes(bundleBase64Url);
  if (bundle.length < EPHEMERAL_PUBKEY_LEN + HKDF_SALT_LEN + IV_LEN) {
    throw new Error("Malformed encrypted note bundle.");
  }

  let offset = 0;
  const ephemeralPublicKeyRaw = bundle.slice(offset, offset + EPHEMERAL_PUBKEY_LEN);
  offset += EPHEMERAL_PUBKEY_LEN;
  const hkdfSalt = bundle.slice(offset, offset + HKDF_SALT_LEN);
  offset += HKDF_SALT_LEN;
  const iv = bundle.slice(offset, offset + IV_LEN);
  offset += IV_LEN;
  const ciphertext = bundle.slice(offset);

  const ephemeralPublicKey = await importPublicKeyRaw(ephemeralPublicKeyRaw);
  const sharedSecretBits = await deriveSharedSecretBits(sessionPrivateKey, ephemeralPublicKey);
  const aesKey = await deriveAesKeyFromSharedSecret(sharedSecretBits, hkdfSalt);

  let plaintext: Uint8Array;
  try {
    plaintext = await aesGcmDecrypt(aesKey, iv, ciphertext);
  } catch {
    throw new Error("This note could not be decrypted -- it may be corrupted or not intended for you.");
  }

  resetAutoLockTimer();
  return plaintext;
}

/* ------------------------------------------------------------------ */
/* Backup export / import                                              */
/* ------------------------------------------------------------------ */

interface BackupFileV1 {
  format: "growthip-encryption-backup";
  version: 1;
  exportedAt: number;
  identity: {
    publicKeyRaw: string; // base64
    wrappedByPassword: string;
    passwordWrapIv: string;
    passwordKdfSalt: string;
    passwordKdfParams: KdfParams;
    wrappedByRecovery: string;
    recoveryWrapIv: string;
    recoveryKdfSalt: string;
    recoveryKdfParams: KdfParams;
    createdAt: number;
  };
}

