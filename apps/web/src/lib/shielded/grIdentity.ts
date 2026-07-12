"use client";

/**
 * grIdentity.ts
 *
 * Orchestration for the gr shielded identity: setup (fresh mnemonic),
 * restore (existing mnemonic), unlock, and session lifecycle.
 *
 * Mirrors encryption/keyManagement.ts's pattern (Argon2id-derived
 * AES-GCM wrap, non-persisted plaintext, auto-lock) but SIMPLIFIED per
 * the Hari 5 decision doc: single wrap under password only -- no
 * dual password/recovery-phrase OR-gate like V4's identity. V4 wraps a
 * key that is otherwise unrelated to any user-held secret, so it needs
 * two independent unlock paths. Here the mnemonic itself already IS the
 * independent, user-held recovery root (mnemonic -> seed is
 * deterministic and needs no password) -- the password only protects
 * the wrapped seed at rest for convenient daily unlock, exactly as
 * documented in seed.ts.
 *
 * The Argon2id worker call is intentionally duplicated here rather than
 * imported from keyManagement.ts (that function isn't exported, and
 * this module must not modify V4's live file) -- but it reuses the SAME
 * underlying kdfWorker.ts, not a separate implementation.
 *
 * Must only run client-side (IndexedDB, Worker, crypto.subtle).
 */

import {
  generateRandomBytes,
  aesGcmEncrypt,
  aesGcmDecrypt,
  importWrappingKey,
} from "@/lib/encryption/cryptoUtils";
import type { KdfRequest, KdfResponse } from "@/lib/encryption/kdfWorker";
import {
  saveGrIdentity,
  loadGrIdentity,
  deleteGrIdentity,
  hasGrIdentity,
  type StoredGrIdentity,
  type GrKdfParams,
} from "./grStorage";
import { newGrMnemonic, isValidGrMnemonic, grSeedFromMnemonic } from "./seed";
import { deriveShieldedKeys } from "./keys";
import { encodeAddress } from "./address";

/** Same parameters as keyManagement.ts's KDF_PARAMS -- kept identical
 * rather than re-tuned, since that choice already went through review. */
const KDF_PARAMS: GrKdfParams = {
  time: 3,
  mem: 65536,
  parallelism: 1,
  hashLen: 32,
};

const AUTO_LOCK_MS = 15 * 60 * 1000;

/* ------------------------------------------------------------------ */
/* Session state (module-scoped, in-memory only, never persisted)      */
/* ------------------------------------------------------------------ */

let sessionSeed: Uint8Array | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

function clearSession(): void {
  sessionSeed = null;
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

export function isGrUnlocked(): boolean {
  return sessionSeed !== null;
}

export function lockGrSession(): void {
  clearSession();
}

/**
 * Returns the unlocked seed for deriveShieldedKeys() calls elsewhere
 * (e.g. computing a nullifier when spending a note). Throws if locked --
 * callers must prompt unlockGrIdentity() first.
 */
export function getGrSeed(): Uint8Array {
  if (sessionSeed === null) {
    throw new Error("gr identity is locked. Unlock with your password first.");
  }
  resetAutoLockTimer();
  return sessionSeed;
}

/* ------------------------------------------------------------------ */
/* Argon2id worker wrapper (duplicated from keyManagement.ts's private */
/* helper -- same kdfWorker.ts, not a reimplementation)                 */
/* ------------------------------------------------------------------ */

function runArgon2idInWorker(secret: string, salt: Uint8Array, params: GrKdfParams): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    if (typeof Worker === "undefined") {
      reject(new Error("Web Workers are not available in this environment."));
      return;
    }

    const worker = new Worker(new URL("../encryption/kdfWorker.ts", import.meta.url));
    const requestId = crypto.randomUUID();

    const timeoutHandle = setTimeout(() => {
      worker.terminate();
      reject(new Error("Argon2id derivation timed out."));
    }, 30_000);

    worker.onmessage = (event: MessageEvent<KdfResponse>) => {
      if (event.data.requestId !== requestId) return;
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
/* Setup (fresh mnemonic)                                               */
/* ------------------------------------------------------------------ */

export interface CreateGrIdentityResult {
  address: string;
  /** 12-word gr mnemonic. Show exactly once; caller (UI) must force a
   * "written down" confirmation before treating setup as complete --
   * same discipline as V4's recovery phrase flow. NEVER the same
   * phrase as V4's note-encryption recovery phrase (Hari 5 hard rule). */
  mnemonic: string;
}

export async function createGrIdentity(password: string, mnemonic: string): Promise<CreateGrIdentityResult> {
  if (await hasGrIdentity()) {
    throw new Error(
      "A gr identity already exists in this browser. Use restoreGrIdentity() to replace it, or unlock the existing one instead.",
    );
  }

  // IMPORTANT: mnemonic is a REQUIRED parameter, not generated internally.
  // It must be the exact same mnemonic the UI already displayed and had
  // the user confirm ("I've written this down") BEFORE calling this
  // function -- generating a fresh one here instead would silently derive
  // the identity from a phrase the user never saw, making their written
  // recovery phrase useless for restoring THIS identity. (This was a real
  // bug caught via manual restore testing: same-mnemonic restore produced
  // a different address every time, because createGrIdentity was
  // regenerating its own mnemonic instead of using the one already shown.)
  if (!isValidGrMnemonic(mnemonic)) {
    throw new Error("Internal error: invalid mnemonic passed to createGrIdentity.");
  }
  const seed = grSeedFromMnemonic(mnemonic);

  const keys = await deriveShieldedKeys(seed);
  const address = await encodeAddress(keys.pkD);

  const salt = generateRandomBytes(16);
  const hash = await runArgon2idInWorker(password, salt, KDF_PARAMS);
  const wrappingKey = await importWrappingKey(hash);
  const { iv, ciphertext } = await aesGcmEncrypt(wrappingKey, seed);

  const identity: StoredGrIdentity = {
    id: "primary",
    address,
    wrappedSeed: ciphertext,
    seedWrapIv: iv,
    seedKdfSalt: salt,
    seedKdfParams: KDF_PARAMS,
    createdAt: Date.now(),
  };

  await saveGrIdentity(identity);

  sessionSeed = seed;
  resetAutoLockTimer();

  return { address, mnemonic };
}

/* ------------------------------------------------------------------ */
/* Restore (existing mnemonic, e.g. new device)                        */
/* ------------------------------------------------------------------ */

export async function restoreGrIdentity(mnemonic: string, newPassword: string): Promise<{ address: string }> {
  if (!isValidGrMnemonic(mnemonic)) {
    throw new Error("This does not look like a valid gr recovery phrase.");
  }

  const seed = grSeedFromMnemonic(mnemonic);
  const keys = await deriveShieldedKeys(seed);
  const address = await encodeAddress(keys.pkD);

  const salt = generateRandomBytes(16);
  const hash = await runArgon2idInWorker(newPassword, salt, KDF_PARAMS);
  const wrappingKey = await importWrappingKey(hash);
  const { iv, ciphertext } = await aesGcmEncrypt(wrappingKey, seed);

  const identity: StoredGrIdentity = {
    id: "primary",
    address,
    wrappedSeed: ciphertext,
    seedWrapIv: iv,
    seedKdfSalt: salt,
    seedKdfParams: KDF_PARAMS,
    createdAt: Date.now(),
  };

  await saveGrIdentity(identity); // overwrites any existing record

  sessionSeed = seed;
  resetAutoLockTimer();

  return { address };
}

/* ------------------------------------------------------------------ */
/* Unlock (daily use, existing stored identity)                        */
/* ------------------------------------------------------------------ */

export async function unlockGrIdentity(password: string): Promise<void> {
  const identity = await loadGrIdentity();
  if (!identity) throw new Error("No gr identity found in this browser.");

  const hash = await runArgon2idInWorker(password, identity.seedKdfSalt, identity.seedKdfParams);
  const wrappingKey = await importWrappingKey(hash);

  let seed: Uint8Array;
  try {
    seed = await aesGcmDecrypt(wrappingKey, identity.seedWrapIv, identity.wrappedSeed);
  } catch {
    throw new Error("Incorrect password.");
  }

  sessionSeed = seed;
  resetAutoLockTimer();
}

/* ------------------------------------------------------------------ */
/* Non-secret read + deletion                                          */
/* ------------------------------------------------------------------ */

/** The gr1... address, if an identity is stored -- no unlock required
 * (addresses are never secret). Useful for "your gr address is ..." UI
 * without prompting for a password. */
export async function getStoredGrAddress(): Promise<string | null> {
  const identity = await loadGrIdentity();
  return identity?.address ?? null;
}

export async function hasStoredGrIdentity(): Promise<boolean> {
  return hasGrIdentity();
}

/** Permanently discards the stored gr identity. There is NO recovery
 * after this except re-entering the 12-word mnemonic via
 * restoreGrIdentity() -- the caller's UI must make this distinction
 * unmistakably clear before calling it. */
export async function deleteGrIdentityCompletely(): Promise<void> {
  await deleteGrIdentity();
  clearSession();
}
