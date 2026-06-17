"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPendingNotes, getClaimedNotes, formatRelativeTime, type PrivateNote } from "@/lib/note";
import { formatAmount, getToken } from "@/lib/tokens";

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
        <div className="py-10 text-center">
          <p className="text-sm text-soft-gray/50">
            {tab === "pending"
              ? "No pending tips. Send a tip to get started."
              : "No claimed tips yet."}
          </p>
          {tab === "pending" && (
            <Link
              href="/deposit"
              className="mt-4 inline-block rounded-full bg-fresh-green px-5 py-2 text-sm font-black text-midnight-blue"
            >
              Send a tip
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <NoteRow key={note.nullifierHash} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note }: { note: PrivateNote }) {
  const token  = getToken(note.token);
  const amount = token
    ? formatAmount(Number(note.amount), token.decimals)
    : note.amount;

  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div>
        <p className="text-sm font-semibold text-white">
          {amount} {note.token}
        </p>
        <p className="text-xs text-soft-gray/50">
          {formatRelativeTime(note.timestamp)}
          {note.claimed && note.claimedAt && (
            <> · Claimed {formatRelativeTime(note.claimedAt)}</>
          )}
        </p>
      </div>

      {note.claimed ? (
        <span className="rounded-full bg-fresh-green/10 px-3 py-1 text-xs font-bold text-fresh-green">
          Claimed
        </span>
      ) : (
        <Link
          href={`/claim?note=${encodeURIComponent(encodeNote(note))}`}
          className="rounded-full bg-neon-violet px-3 py-1 text-xs font-bold text-white transition hover:scale-[1.02]"
        >
          Claim →
        </Link>
      )}
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

// Re-export helper for use in NoteRow
function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}
