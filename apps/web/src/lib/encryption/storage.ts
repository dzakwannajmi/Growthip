/**
 * storage.ts
 *
 * IndexedDB persistence for the encrypted identity record (wrapped
 * private key, salts, KDF params). Uses the native IndexedDB API
 * directly -- no third-party wrapper library, to minimize supply-chain
 * surface for code that touches key material storage.
 *
 * Schema: a single object store, "identity", holding exactly one record
 * (keyPath "id", always the literal string "primary") per wallet address.
 * Each wallet address gets its own IndexedDB database, namespaced by address,
 * so multiple wallets can coexist in the same browser without conflict.
 */

const DB_VERSION = 1;
const STORE_NAME = "identity";
const RECORD_ID = "primary";

/** Get database name namespaced by wallet address from localStorage. */
function getDbName(): string {
  const addr = typeof window !== "undefined"
    ? (localStorage.getItem("growthip:wallet") ?? "default")
    : "default";
  return `growthip-encryption-${addr}`;
}

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
    const request = indexedDB.open(getDbName(), DB_VERSION);

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
          `Failed to open IndexedDB: ${request.error?.message ?? "unknown error"}`,
        ),
      );
    };
  });
}

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
