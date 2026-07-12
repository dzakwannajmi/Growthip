/**
 * grStorage.ts
 *
 * IndexedDB persistence for the wrapped `gr` shielded-identity seed.
 * Deliberately a SEPARATE database from encryption/storage.ts's V4
 * "identity" store -- different DB name prefix, different record shape,
 * zero shared state. Per Hari 5's hard rule: the gr mnemonic must never
 * be conflated with the V4 note-encryption recovery phrase, and that
 * separation extends to storage, not just the UI label.
 *
 * Schema: one object store, "gr-identity", one record (id "primary")
 * per wallet address -- same per-wallet DB namespacing pattern as V4
 * (growthip:wallet from localStorage), just a different DB name prefix
 * so the two databases never collide.
 */

const DB_VERSION = 1;
const STORE_NAME = "gr-identity";
const RECORD_ID = "primary";

function getDbName(): string {
  const addr = typeof window !== "undefined"
    ? (localStorage.getItem("growthip:wallet") ?? "default")
    : "default";
  return `growthip-gr-${addr}`;
}

export interface GrKdfParams {
  time: number;
  mem: number;
  parallelism: number;
  hashLen: number;
}

export interface StoredGrIdentity {
  id: "primary";
  /** gr1... address string -- NOT secret, cached here so the UI can show
   * "your gr address is ..." without requiring an unlock. */
  address: string;

  wrappedSeed: Uint8Array;
  seedWrapIv: Uint8Array;
  seedKdfSalt: Uint8Array;
  seedKdfParams: GrKdfParams;

  createdAt: number;
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
          `Failed to open gr IndexedDB: ${request.error?.message ?? "unknown error"}`,
        ),
      );
    };
  });
}

export async function saveGrIdentity(identity: StoredGrIdentity): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(identity);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(`Failed to save gr identity: ${tx.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

export async function loadGrIdentity(): Promise<StoredGrIdentity | null> {
  const db = await openDatabase();
  try {
    return await new Promise<StoredGrIdentity | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(RECORD_ID);
      request.onsuccess = () => resolve((request.result as StoredGrIdentity | undefined) ?? null);
      request.onerror = () =>
        reject(new Error(`Failed to load gr identity: ${request.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

export async function deleteGrIdentity(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(RECORD_ID);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(new Error(`Failed to delete gr identity: ${tx.error?.message ?? "unknown error"}`));
    });
  } finally {
    db.close();
  }
}

export async function hasGrIdentity(): Promise<boolean> {
  return (await loadGrIdentity()) !== null;
}
