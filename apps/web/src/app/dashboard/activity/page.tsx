"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import {
  getPendingNotes,
  getClaimedNotes,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";
import Link from "next/link";

type Filter = "all" | "received" | "withdrawn";

function formatAmount(note: PrivateNote): string {
  const token = getToken(note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}

export default function ActivityPage() {
  const [filter, setFilter]   = useState<Filter>("all");
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);

  useEffect(() => {
    setPending(getPendingNotes());
    setClaimed(getClaimedNotes());
  }, []);

  const notes = filter === "all"
    ? [...claimed, ...pending].sort((a, b) => b.timestamp - a.timestamp)
    : filter === "received"
    ? [...pending].sort((a, b) => b.timestamp - a.timestamp)
    : [...claimed].sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));

  return (
    <div className="p-4 md:p-8 lg:p-10 w-full" style={{ background: "#FAFAFA" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Activity</h1>
          <p style={{ fontSize: "14px", color: "#737373", marginTop: "4px" }}>Your tip transaction history</p>
        </div>

        {/* Filter */}
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "12px 16px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#A3A3A3", paddingRight: "16px", borderRight: "1px solid #E5E5E5" }}>
            <Icon icon="ph:funnel-bold" style={{ fontSize: "16px" }} />
            FILTER
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["all", "received", "withdrawn"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "6px 16px", borderRadius: "8px", fontSize: "13px",
                  fontWeight: filter === f ? 700 : 500,
                  background: filter === f ? "#0A0A0A" : "transparent",
                  color: filter === f ? "white" : "#525252",
                  border: "none", cursor: "pointer", transition: "all 0.15s",
                }}
              >
                {f === "all" ? "All Tips" : f === "received" ? "Pending" : "Withdrawn"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {notes.length === 0 ? (
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Icon icon="ph:gift-bold" style={{ fontSize: "28px", color: "#A3A3A3" }} />
            </div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A", marginBottom: "4px" }}>No tips yet</p>
            <p style={{ fontSize: "13px", color: "#737373" }}>Share your link or send a tip to get started!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {notes.map((note) => (
              <div
                key={note.nullifierHash || note.commitment}
                style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}
              >
                {/* Icon */}
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: note.claimed ? "#F0FDF4" : "#FAFAFA", border: `1px solid ${note.claimed ? "#BBF7D0" : "#E5E5E5"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon
                    icon={note.claimed ? "ph:check-circle-bold" : "ph:clock-bold"}
                    style={{ fontSize: "20px", color: note.claimed ? "#22c55e" : "#A3A3A3" }}
                  />
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "#0A0A0A" }}>{formatAmount(note)}</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#525252" }}>{note.token}</span>
                    <span style={{
                      fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px",
                      background: note.claimed ? "#F0FDF4" : "#FAFAFA",
                      color: note.claimed ? "#22c55e" : "#A3A3A3",
                      border: `1px solid ${note.claimed ? "#BBF7D0" : "#E5E5E5"}`,
                    }}>
                      {note.claimed ? "Withdrawn" : "Pending"}
                    </span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#A3A3A3", marginTop: "4px" }}>
                    {note.claimed && note.claimedAt
                      ? `Withdrawn ${formatRelativeTime(note.claimedAt)}`
                      : `Deposited ${formatRelativeTime(note.timestamp)}`}
                    {note.depositIndex !== undefined && (
                      <span style={{ marginLeft: "8px" }}>· Index #{note.depositIndex}</span>
                    )}
                  </p>
                </div>

                {/* Action */}
                {note.claimed ? (
                  <a
                    href={"https://stellar.expert/explorer/testnet/tx/" + (note.txHash || note.nullifierHash)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#6366f1", textDecoration: "none", flexShrink: 0 }}
                  >
                    <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} />
                    Stellar Expert
                  </a>
                ) : (
                  <Link
                    href={`/dashboard?tab=withdraw&note=${encodeURIComponent(encodeNote(note))}`}
                    style={{ display: "flex", alignItems: "center", gap: "4px", padding: "6px 14px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
                  >
                    Claim →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
