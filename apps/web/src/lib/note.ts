/**
 * Private note encoding, decoding, and local storage management.
 *
 * A private note is a bearer instrument — whoever holds it can claim the tip.
 * Notes are stored in localStorage and must never be shared publicly.
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
}

const STORAGE_KEY = "growthip:notes:v3";

/** Encode a note to a base64 string for sharing/QR. */
export function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}

/** Decode a base64 note string. Returns null if invalid. */
export function decodeNote(encoded: string): PrivateNote | null {
  try {
    const parsed = JSON.parse(atob(encoded));
    if (parsed.version !== "growthip-v3") return null;
    if (!parsed.secret || !parsed.nullifier || !parsed.recipientHash) return null;
    return parsed as PrivateNote;
  } catch {
    return null;
  }
}

/** Save a note to localStorage. */
export function saveNote(note: PrivateNote): void {
  const notes = getAllNotes();
  // Prevent duplicates by nullifierHash
  const exists = notes.some((n) => n.nullifierHash === note.nullifierHash);
  if (!exists) {
    notes.push(note);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }
}

/** Get all notes from localStorage. */
export function getAllNotes(): PrivateNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PrivateNote[];
  } catch {
    return [];
  }
}

/** Get only unclaimed notes. */
export function getPendingNotes(): PrivateNote[] {
  return getAllNotes().filter((n) => !n.claimed);
}

/** Get only claimed notes. */
export function getClaimedNotes(): PrivateNote[] {
  return getAllNotes().filter((n) => n.claimed);
}

/** Mark a note as claimed by its nullifierHash. */
export function markNoteAsClaimed(nullifierHash: string): void {
  const notes = getAllNotes().map((n) =>
    n.nullifierHash === nullifierHash
      ? { ...n, claimed: true, claimedAt: Date.now() }
      : n,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

/** Delete a note by nullifierHash (use with caution — irreversible). */
export function deleteNote(nullifierHash: string): void {
  const notes = getAllNotes().filter((n) => n.nullifierHash !== nullifierHash);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
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
