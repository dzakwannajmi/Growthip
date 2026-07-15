/**
 * Private note encoding, decoding, and local storage management.
 *
 * A private note is a bearer instrument — whoever holds it can claim the tip.
 * Notes are stored in localStorage and must never be shared publicly.
 *
 * STORAGE IS NAMESPACED PER WALLET ADDRESS (growthip:notes:${address}) so
 * that switching the connected wallet account in the same browser does
 * not show one address's private notes while a different address is
 * active. This was a real gap before this change: all addresses sharing
 * one browser saw the exact same note list, because storage was a single
 * global key with no address parameter at all.
 *
 * Note structure (V3):
 *   secret       — random 31-byte field element (private input to circuit)
 *   nullifier    — random 31-byte field element (private input to circuit)
 *   recipientHash — Poseidon(walletAddress) field element (circuit binding)
 *   commitment   — Poseidon(secret, nullifier, recipientHash)
 *   nullifierHash — Poseidon(nullifier) — used for double-claim prevention
 *   root         — Merkle root at time of deposit
 *   token        — token symbol (XLM | USDC | EURC)
 *   amount       — tip amount in base units
 *   timestamp    — deposit timestamp (ms)
 *   depositIndex — commitment index in pool
 */

import type { TokenSymbol } from "./tokens";

export interface PrivateNote {
  version:       "growthip-v3";
  secret:        string;
  nullifier:     string;
  recipientHash: string;
  commitment:    string;
  nullifierHash: string;
  root:          string;
  token:         TokenSymbol;
  amount:        string;
  timestamp:     number;
  depositIndex:  number;
  claimed:       boolean;
  claimedAt?:    number;
  txHash?:       string;
  recipientAddress?: string;  // wallet address of the creator (namespace key)
  poolId?: string;             // contract address of the pool this note belongs to
}

/** Legacy, pre-namespacing storage key. Read-only after migration exists —
 * never written to again, kept only so migrateLegacyNotes() can find and
 * move data out of it. */
const LEGACY_STORAGE_KEY = "growthip:notes:v3";

function storageKeyFor(address: string): string {
  // Full, untruncated address in the key — truncating would risk
  // collisions between different addresses sharing a short prefix.
  return `growthip:notes:${address}`;
}


/**
 * Saves the full notes array for a given address, overwriting whatever
 * was there before. Low-level primitive -- prefer saveNote() for adding
 * a single note (it handles dedup + read-modify-write for you).
 */
export function saveNotes(address: string, notes: PrivateNote[]): void {
  localStorage.setItem(storageKeyFor(address), JSON.stringify(notes));
}

/** Returns the full notes array for a given address, or [] if none exist. */
export function getNotes(address: string): PrivateNote[] {
  try {
    const raw = localStorage.getItem(storageKeyFor(address));
    if (!raw) return [];
    return JSON.parse(raw) as PrivateNote[];
  } catch {
    return [];
  }
}

/** Save a single note under the given address's namespace, deduplicated
 * by nullifierHash. */
export function saveNote(address: string, note: PrivateNote): void {
  const notes = getNotes(address);
  const exists = notes.some((n) => n.nullifierHash === note.nullifierHash);
  if (!exists) {
    notes.push(note);
    saveNotes(address, notes);
  }
}


export function getPendingNotes(address: string): PrivateNote[] {
  return getNotes(address).filter((n) => !n.claimed);
}

export function getClaimedNotes(address: string): PrivateNote[] {
  return getNotes(address).filter((n) => n.claimed);
}

/** Mark a note as claimed by its nullifierHash, within the given
 * address's namespace. */
export function markNoteAsClaimed(address: string, nullifierHash: string, txHash?: string): void {
  const notes = getNotes(address).map((n) =>
    n.nullifierHash === nullifierHash
      ? { ...n, claimed: true, claimedAt: Date.now(), txHash }
      : n,
  );
  saveNotes(address, notes);
}

/**
 * One-way migration: moves notes from the old, unnamespaced global
 * storage key into `currentAddress`'s namespaced bucket -- but ONLY
 * notes this address can actually claim or already claimed (matched by
 * recomputing recipientHash for `currentAddress` and comparing).
 *
 * DESIGN DECISION, not an oversight: legacy notes don't record which
 * wallet originally sent them (a PrivateNote has no "depositor" field,
 * only recipientHash). A note sent BY this address but FOR a different
 * creator therefore cannot be safely attributed to `currentAddress`
 * here -- guessing wrong would put one address's note history into
 * another address's private bucket. Such notes are left in the legacy
 * key, unmigrated, rather than risk a privacy leak. The legacy key
 * itself is never deleted, so no data is lost -- it just isn't
 * automatically sorted into a per-address bucket for the "sent as
 * supporter" case.
 *
 * Idempotent: safe to call on every app load. Returns the number of
 * notes migrated, for optional UI feedback ("imported N notes").
 */
export function migrateLegacyNotes(
  currentAddress: string,
  recipientHashForAddress: string,
): number {
  let legacy: PrivateNote[];
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return 0;
    legacy = JSON.parse(raw) as PrivateNote[];
  } catch {
    return 0;
  }

  const matching = legacy.filter((n) => n.recipientHash === recipientHashForAddress);
  if (matching.length === 0) return 0;

  const existing = getNotes(currentAddress);
  const existingHashes = new Set(existing.map((n) => n.nullifierHash));
  const toAdd = matching.filter((n) => !existingHashes.has(n.nullifierHash));

  if (toAdd.length > 0) {
    saveNotes(currentAddress, [...existing, ...toAdd]);
  }

  return toAdd.length;
}

/** Format timestamp to human-readable relative time. */
export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);

  if (minutes < 1)  return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24)   return `${hours}h ago`;
  return `${days}d ago`;
}