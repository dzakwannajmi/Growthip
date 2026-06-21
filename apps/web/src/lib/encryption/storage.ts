/**
 * storage.ts
 *
 * IndexedDB persistence for the encrypted identity record (wrapped
 * private key, salts, KDF params). Uses the native IndexedDB API
 * directly -- no third-party wrapper library, to minimize supply-chain
 * surface for code that touches key material storage.
 *
 * Schema: a single object store, "identity", holding exactly one record
 * (keyPath "id", always the literal string "primary") -- one browser
 * profile holds one creator's encryption identity. There is no need for
 * a multi-record schema here.
 */

const DB_NAME = "growthip-encryption";
const DB_VERSION = 1;
const STORE_NAME = "identity";
const RECORD_ID = "primary";

export interface StoredIdentity {
  id: "primary";
  publicKeyRaw: Uint8Array;

  wrappedByPassword: Uint8Array;
  passwordWrapIv: Uint8Array;
  passwordKdfSalt: Uint8Array;
  passwordKdfParams: KdfParams;

  wrappedByRecovery: Uint8Array;
  recoveryWrapIv: Uint8Array;
  recoveryKdfSalt: Uint8Array;
  recoveryKdfParams: KdfParams;

  createdAt: number;
}

export interface KdfParams {
  time: number;
  mem: number;
  parallelism: number;
  hashLen: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      reject(
        new Error(
          `Failed to open IndexedDB '${DB_NAME}': ${request.error?.message ?? "unknown error"}`,
        ),
      );
    };
  });
}

/**
 * Persists the identity record. Overwrites any existing record (there is
 * only ever one). Note: this stores plain Uint8Array fields, NOT
 * CryptoKey objects -- the private key itself is never stored directly;
 * only its AES-GCM-wrapped (encrypted) bytes are. There is therefore no
 * dependency on browsers' CryptoKey structured-clone support for this
 * store specifically (that question only applies if we were storing
 * CryptoKey objects directly, which this design deliberately avoids for
 * the persisted record -- see keyManagement.ts for the session-only,
 * in-memory non-extractable CryptoKey, which never touches IndexedDB).
 */
export async function saveIdentity(identity: StoredIdentity): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(`Failed to save identity: ${tx.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

/** Returns null if no identity has been set up yet in this browser. */
export async function loadIdentity(): Promise<StoredIdentity | null> {
  const db = await openDatabase();
  try {
    return await new Promise<StoredIdentity | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(RECORD_ID);
      request.onsuccess = () => resolve((request.result as StoredIdentity | undefined) ?? null);
      request.onerror = () =>
        reject(new Error(`Failed to load identity: ${request.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

/**
 * Deletes the stored identity entirely. Used only for explicit
 * "deactivate / start over" flows -- callers must warn the user this is
 * irreversible without a backup file or recovery phrase already saved
 * elsewhere, since this removes the only locally-stored copy of the
 * wrapped private key.
 */
export async function deleteIdentity(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(`Failed to delete identity: ${tx.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

export async function hasIdentity(): Promise<boolean> {
  return (await loadIdentity()) !== null;
}
