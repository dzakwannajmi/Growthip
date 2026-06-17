"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getPendingNotes,
  getClaimedNotes,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";

function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}

function formatNoteAmount(note: PrivateNote): string {
  const token = getToken(note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  const display = human % 1 === 0 ? human.toFixed(0) : human.toFixed(1);
  return `${display} ${token.symbol}`;
}

export default function PendingNotes() {
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);
  const [tab, setTab]         = useState<"pending" | "claimed">("pending");

  useEffect(() => {
    setPending(getPendingNotes());
    setClaimed(getClaimedNotes());
  }, []);

  const notes = tab === "pending" ? pending : claimed;

  return (
    <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 backdrop-blur-xl">
      {/* Tabs */}
      <div className="mb-5 flex gap-2">
        <TabButton
          active={tab === "pending"}
          onClick={() => setTab("pending")}
          label={`Pending (${pending.length})`}
        />
        <TabButton
          active={tab === "claimed"}
          onClick={() => setTab("claimed")}
          label={`Claimed (${claimed.length})`}
        />
      </div>

      {notes.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteRow key={note.nullifierHash || note.commitment} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ tab }: { tab: "pending" | "claimed" }) {
  if (tab === "pending") {
    return (
      <div className="py-10 text-center">
        <p className="text-3xl mb-3">🌱</p>
        <p className="text-sm font-semibold text-white">No pending tips</p>
        <p className="mt-1 text-xs text-soft-gray/50">
          Send a tip to get started. Your private notes will appear here.
        </p>
        <Link
          href="/deposit"
          className="mt-4 inline-block rounded-full bg-fresh-green px-5 py-2 text-sm font-black text-midnight-blue"
        >
          Send a tip
        </Link>
      </div>
    );
  }
  return (
    <div className="py-10 text-center">
      <p className="text-3xl mb-3">✅</p>
      <p className="text-sm font-semibold text-white">No claimed tips yet</p>
      <p className="mt-1 text-xs text-soft-gray/50">
        Claimed tips will appear here after you use a private note to claim.
      </p>
    </div>
  );
}

function NoteRow({ note }: { note: PrivateNote }) {
  const amount = formatNoteAmount(note);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        {/* Left: amount + meta */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-white">{amount}</p>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-soft-gray/50">
              {note.token}
            </span>
          </div>
          <p className="mt-1 text-xs text-soft-gray/50">
            Deposited {formatRelativeTime(note.timestamp)}
            {note.depositIndex !== undefined && (
              <span className="ml-2 text-soft-gray/30">· Index #{note.depositIndex}</span>
            )}
          </p>
          {note.claimed && note.claimedAt && (
            <p className="mt-0.5 text-xs text-fresh-green/70">
              Claimed {formatRelativeTime(note.claimedAt)}
            </p>
          )}
          {/* Commitment preview */}
          <p className="mt-1 font-mono text-xs text-soft-gray/25 truncate max-w-xs">
            {note.commitment.slice(0, 16)}...
          </p>
        </div>

        {/* Right: action */}
        <div className="flex-shrink-0">
          {note.claimed ? (
            <span className="rounded-full bg-fresh-green/10 px-3 py-1.5 text-xs font-bold text-fresh-green">
              ✅ Claimed
            </span>
          ) : (
            <Link
              href={`/claim?note=${encodeURIComponent(encodeNote(note))}`}
              className="inline-block rounded-full bg-neon-violet px-4 py-1.5 text-xs font-bold text-white transition hover:scale-[1.02] hover:bg-neon-violet/80"
            >
              Claim →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active:  boolean;
  onClick: () => void;
  label:   string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-neon-violet text-white"
          : "text-soft-gray/60 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}
