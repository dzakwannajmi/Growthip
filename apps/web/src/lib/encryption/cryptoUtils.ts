/**
 * cryptoUtils.ts
 *
 * Low-level Web Crypto API primitives for Growthip's private note
 * encryption. Every function here is a thin, well-documented wrapper
 * around a single native browser crypto operation -- no business logic,
 * no IndexedDB, no UI concerns. Higher-level orchestration lives in
 * keyManagement.ts.
 *
 * All operations run in the browser only. Nothing here ever sends key
 * material anywhere -- not to a server, not to Growthip's own backend
 * (which doesn't exist), nowhere.
 */

/**
 * Ensures a Uint8Array is backed by a concrete ArrayBuffer (not
 * SharedArrayBuffer), which is what the Web Crypto API's BufferSource
 * type actually requires. Uint8Array values arriving as function
 * parameters are typed by TypeScript as Uint8Array<ArrayBufferLike>,
 * which includes SharedArrayBuffer and so isn't directly assignable to
 * BufferSource -- this makes a fresh, guaranteed-compatible copy.
 */
function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer as ArrayBuffer;
}

/* ------------------------------------------------------------------ */
/* X25519 keypair generation + ECDH                                    */
/* ------------------------------------------------------------------ */

export interface X25519KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

/**
 * Generates a new X25519 keypair for note encryption.
 *
 * `extractable: true` here is intentional and required -- this is the
 * ONE moment the private key is allowed to exist in exportable form, so
 * it can be wrapped (encrypted) for storage immediately after. Callers
 * must export + wrap it right away and never hold onto this extractable
 * reference longer than necessary. See keyManagement.ts's
 * `createIdentity()` for the only sanctioned caller of this function.
 */
export async function generateX25519KeyPair(): Promise<X25519KeyPair> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "X25519" },
    true, // extractable -- see doc comment above
    ["deriveKey", "deriveBits"],
  )) as CryptoKeyPair;

  return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
}

/**
 * Exports an X25519 public key as raw bytes (32 bytes), suitable for
 * publishing on-chain via growthip-creator-registry's
 * register_encryption_pubkey().
 */
export async function exportPublicKeyRaw(publicKey: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return new Uint8Array(raw);
}

/**
 * Imports a raw 32-byte X25519 public key (e.g. read from on-chain
 * storage) back into a usable CryptoKey, for ECDH on the supporter's side.
 */
export async function importPublicKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(raw),
    { name: "X25519" },
    true, // public keys are never secret; extractable is harmless
    [],
  );
}

/**
 * Exports an X25519 PRIVATE key as raw PKCS8 bytes. Only ever called once,
 * immediately after generateX25519KeyPair(), to wrap the key for storage.
 * The resulting bytes must be encrypted (see wrapKeyBytes below) and never
 * persisted or transmitted unencrypted.
 */
export async function exportPrivateKeyPkcs8(privateKey: CryptoKey): Promise<Uint8Array> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", privateKey);
  return new Uint8Array(pkcs8);
}

/**
 * Re-imports a private key from raw PKCS8 bytes as NON-EXTRACTABLE. This
 * is the key used for actual day-to-day decrypt operations during an
 * unlocked session -- once imported this way, the raw bytes can never be
 * pulled back out of this CryptoKey via the Web Crypto API again.
 */
export async function importPrivateKeyNonExtractable(
  pkcs8Bytes: Uint8Array,
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    toBufferSource(pkcs8Bytes),
    { name: "X25519" },
    false, // non-extractable -- the whole point of this function
    ["deriveKey", "deriveBits"],
  );
}

/**
 * Performs ECDH key agreement, deriving 256 raw bits of shared secret
 * from one party's private key and the other party's public key.
 * Works identically whether called with a creator's (non-extractable)
 * private key + a supporter's ephemeral public key, or vice versa --
 * ECDH is symmetric by construction.
 */
export async function deriveSharedSecretBits(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "X25519", public: peerPublicKey },
    privateKey,
    256,
  );
}

/* ------------------------------------------------------------------ */
/* HKDF: shared secret -> AES-GCM encryption key                       */
/* ------------------------------------------------------------------ */

/**
 * Derives an AES-256-GCM key from raw ECDH shared-secret bits via HKDF.
 * We never use the raw ECDH output directly as an encryption key --
 * HKDF is the standard, correct way to turn a shared secret into key
 * material with good uniform-randomness properties.
 *
 * `info` provides domain separation -- a fixed, app-specific string
 * ensures this derived key can't collide with a key derived for some
 * unrelated purpose, even from the same shared secret.
 */
export async function deriveAesKeyFromSharedSecret(
  sharedSecretBits: ArrayBuffer,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const hkdfBaseKey = await crypto.subtle.importKey(
    "raw",
    sharedSecretBits,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  );

  const info = new TextEncoder().encode("growthip-private-note-v1");

  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: toBufferSource(salt), info },
    hkdfBaseKey,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable; this key only needs to encrypt/decrypt once
    ["encrypt", "decrypt"],
  );
}

/* ------------------------------------------------------------------ */
/* AES-GCM encrypt / decrypt for arbitrary plaintext bytes             */
/* ------------------------------------------------------------------ */

export interface AesGcmCiphertext {
  /** 12-byte random IV. MUST be unique per encryption with the same key
   * (we always derive a fresh key per ECDH exchange, so this is safe by
   * construction, but the IV is still randomized as defense in depth). */
  iv: Uint8Array;
  /** Ciphertext, including the 16-byte GCM authentication tag appended
   * by the Web Crypto API (this is the default browser behavior). */
  ciphertext: Uint8Array;
}

export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<AesGcmCiphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBufferSource(iv), tagLength: 128 },
    key,
    toBufferSource(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(encrypted) };
}

/**
 * Decrypts AES-GCM ciphertext. Throws if the authentication tag doesn't
 * verify (tampered ciphertext, or wrong key) -- callers should catch and
 * present a clear "this note could not be decrypted" error rather than
 * letting this exception surface raw to the user.
 */
export async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(iv), tagLength: 128 },
    key,
    toBufferSource(ciphertext),
  );
  return new Uint8Array(decrypted);
}

/* ------------------------------------------------------------------ */
/* Key wrapping: protecting the private key at rest with a password-   */
/* or recovery-phrase-derived key                                      */
/* ------------------------------------------------------------------ */

/**
 * Wraps (encrypts) arbitrary key bytes using AES-GCM with a key derived
 * elsewhere (e.g. from Argon2id in kdfWorker.ts). This is how the
 * extractable private key, exported once at generation time, is turned
 * into something safe to persist in IndexedDB.
 */
export async function wrapKeyBytes(
  wrappingKey: CryptoKey,
  keyBytesToWrap: Uint8Array,
): Promise<AesGcmCiphertext> {
  return aesGcmEncrypt(wrappingKey, keyBytesToWrap);
}

/** Reverses wrapKeyBytes(), returning the original raw key bytes. */
export async function unwrapKeyBytes(
  wrappingKey: CryptoKey,
  iv: Uint8Array,
  wrappedBytes: Uint8Array,
): Promise<Uint8Array> {
  return aesGcmDecrypt(wrappingKey, iv, wrappedBytes);
}

/**
 * Imports raw bytes (e.g. an Argon2id hash output) as a non-extractable
 * AES-GCM key, suitable for use as a wrapping key.
 */
export async function importWrappingKey(rawKeyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toBufferSource(rawKeyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ------------------------------------------------------------------ */
/* Encoding helpers                                                     */
/* ------------------------------------------------------------------ */

/** Base64url (no padding) -- safe to embed directly in a URL query param. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(padded + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Standard base64 (with padding) -- used for the JSON backup file, where
 * URL-safety doesn't matter and standard base64 is more conventional. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}
