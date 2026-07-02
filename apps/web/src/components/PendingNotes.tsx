"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isConnected, requestAccess } from "@stellar/freighter-api";
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
  const [address, setAddress] = useState("");
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);
  const [tab, setTab]         = useState<"pending" | "claimed">("pending");

  // This component is rendered standalone (no address prop available
  // from its parent), so it detects the connected wallet itself --
  // notes are namespaced per address, so we need to know which one is
  // active before reading anything from storage.
  useEffect(() => {
    (async () => {
      const conn = await isConnected();
      if (!conn.isConnected) return;
      const access = await requestAccess();
      if (!access.error) setAddress(access.address);
    })();
  }, []);

  useEffect(() => {
    if (!address) { setPending([]); setClaimed([]); return; }
    setPending(getPendingNotes(address));
    setClaimed(getClaimedNotes(address));
  }, [address]);

  const notes = tab === "pending" ? pending : claimed;

  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
        {(["pending", "claimed"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px",
              borderRadius: "999px",
              fontSize: "14px",
              fontWeight: tab === t ? 700 : 500,
              background: tab === t ? "#0A0A0A" : "transparent",
              color: tab === t ? "white" : "#737373",
              border: "none",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {t === "pending" ? `Pending (${pending.length})` : `Claimed (${claimed.length})`}
          </button>
        ))}
      </div>

      {notes.length === 0 ? (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <p style={{ fontSize: "14px", color: "#737373" }}>
            {tab === "pending"
              ? "No pending tips. Send a tip to get started."
              : "No claimed tips yet."}
          </p>
          {tab === "pending" && (
            <Link
              href="/dashboard/links"
              style={{
                display: "inline-block",
                marginTop: "16px",
                padding: "8px 20px",
                borderRadius: "999px",
                background: "#0A0A0A",
                color: "white",
                fontSize: "14px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Get your tip link
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {notes.map((note) => (
            <NoteRow key={note.nullifierHash || note.commitment} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({ note }: { note: PrivateNote }) {
  const amount = formatNoteAmount(note);

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: "12px",
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid #E5E5E5",
      background: "#FAFAFA",
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "14px", fontWeight: 800, color: "#0A0A0A" }}>{amount}</span>
          <span style={{
            fontSize: "11px",
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: "999px",
            background: "#F5F5F5",
            color: "#525252",
          }}>{note.token}</span>
        </div>
        <p style={{ fontSize: "12px", color: "#737373", marginTop: "4px" }}>
          Deposited {formatRelativeTime(note.timestamp)}
          {note.depositIndex !== undefined && (
            <span style={{ color: "#A3A3A3", marginLeft: "8px" }}>· Index #{note.depositIndex}</span>
          )}
        </p>
        {note.claimed && note.claimedAt && (
          <p style={{ fontSize: "12px", color: "#22c55e", marginTop: "2px" }}>
            Claimed {formatRelativeTime(note.claimedAt)}
          </p>
        )}
        <p style={{ fontSize: "11px", color: "#D4D4D4", marginTop: "4px", fontFamily: "monospace" }}>
          {note.commitment.slice(0, 16)}...
        </p>
      </div>

      <div style={{ flexShrink: 0 }}>
        {note.claimed ? (
          <span style={{
            fontSize: "12px",
            fontWeight: 700,
            padding: "6px 12px",
            borderRadius: "999px",
            background: "#F0FDF4",
            color: "#22c55e",
          }}>✓ Claimed</span>
        ) : (
          <Link
            href={`/dashboard/claim?note=${encodeURIComponent(encodeNote(note))}`}
            style={{
              fontSize: "13px",
              fontWeight: 700,
              padding: "6px 14px",
              borderRadius: "999px",
              background: "#0A0A0A",
              color: "white",
              textDecoration: "none",
            }}
          >
            Claim →
          </Link>
        )}
      </div>
    </div>
  );
}
