"use client";

import { useState } from "react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import type { PrivateNote } from "@/lib/note";
import { encodeNote, formatRelativeTime } from "@/lib/note";
import { formatAmount, getToken } from "@/lib/tokens";

interface PrivateNoteDisplayProps {
  note: PrivateNote;
  onDismiss?: () => void;
}

export default function PrivateNoteDisplay({ note, onDismiss }: PrivateNoteDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const encoded = encodeNote(note);
  const token   = getToken(note.token);
  const amount  = token ? formatAmount(Number(note.amount), token) : note.amount;

  async function copyNote() {
    await navigator.clipboard.writeText(encoded);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadNote() {
    const blob = new Blob([encoded], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `growthip-note-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-[2rem] border border-fresh-green/30 bg-fresh-green/5 p-5">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-sm font-bold text-fresh-green">
            ✅ Private Note Generated
          </p>
          <p className="mt-1 text-xs text-soft-gray/60">
            {amount} {note.token} · {formatRelativeTime(note.timestamp)}
          </p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-soft-gray/40 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>

      {/* Warning */}
      <div className="mb-4 rounded-2xl border border-coral-red/20 bg-coral-red/10 p-4">
        <p className="text-sm font-bold text-coral-red">
          ⚠️ Save this note immediately
        </p>
        <p className="mt-1 text-xs leading-6 text-soft-gray/75">
          This is your only way to claim this tip. It is not stored on-chain.
          If you lose it, the tip cannot be recovered.
        </p>
      </div>

      {/* Encoded note */}
      <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft-gray/40">
          Private Note
        </p>
        <p className="break-all font-mono text-xs leading-6 text-soft-gray/80">
          {encoded.slice(0, 80)}...
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={copyNote}
          className="rounded-2xl bg-fresh-green px-4 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02]"
        >
          {copied ? "✅ Copied!" : "Copy Note"}
        </button>
        <button
          onClick={downloadNote}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
        >
          Download .txt
        </button>
        <button
          onClick={() => setShowQR((prev) => !prev)}
          className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08]"
        >
          {showQR ? "Hide QR Code" : "Show QR Code"}
        </button>
      </div>

      {/* QR Code */}
      {showQR && (
        <div className="mt-4 flex flex-col items-center gap-3">
          <div className="rounded-2xl bg-white p-4">
            <QRCode
              value={encoded}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <p className="text-center text-xs text-soft-gray/50">
            Share this QR code privately with your recipient.
            Anyone who scans it can claim the tip.
          </p>
        </div>
      )}
    </div>
  );
}
