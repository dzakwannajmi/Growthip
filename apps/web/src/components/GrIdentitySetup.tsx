"use client";

/**
 * GrIdentitySetup.tsx
 *
 * Setup / restore / unlock UI for the gr shielded identity (V5 tipping).
 * Deliberately visually and behaviorally separate from EncryptionSetup.tsx
 * (V4 note-encryption identity) -- different mnemonic, different storage,
 * different unlock flow -- per the Hari 5 hard rule against conflating
 * the two.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  hasStoredGrIdentity,
  getStoredGrAddress,
  isGrUnlocked,
  createGrIdentity,
  restoreGrIdentity,
  unlockGrIdentity,
  lockGrSession,
  deleteGrIdentityCompletely,
} from "@/lib/shielded";

type Stage =
  | "checking"
  | "choice"
  | "create-reveal"
  | "create-password"
  | "restore"
  | "locked"
  | "unlocked";

const inputClass =
  "w-full rounded-xl px-4 py-3 text-sm bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#0A0A0A] dark:text-[#F5F5F5] border border-transparent focus:border-[#00B2FF] outline-none transition-colors";

const primaryButtonClass =
  "w-full rounded-xl py-3 text-sm font-bold bg-[#0A0A0A] dark:bg-white text-white dark:text-[#0A0A0A] hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed";

const secondaryButtonClass =
  "w-full rounded-xl py-3 text-sm font-bold bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#0A0A0A] dark:text-[#F5F5F5] hover:bg-[#EBEBEB] dark:hover:bg-[#333333] transition-colors";

export default function GrIdentitySetup() {
  const [stage, setStage] = useState<Stage>("checking");
  const [address, setAddress] = useState<string | null>(null);
  const [mnemonic, setMnemonic] = useState("");
  const [confirmedWritten, setConfirmedWritten] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [restoreMnemonic, setRestoreMnemonic] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await hasStoredGrIdentity();
      if (stored) {
        const addr = await getStoredGrAddress();
        setAddress(addr);
        setStage(isGrUnlocked() ? "unlocked" : "locked");
      } else {
        setStage("choice");
      }
    })();
  }, []);

  function resetTransientFields() {
    setPassword("");
    setConfirmPassword("");
    setRestoreMnemonic("");
    setError("");
  }

  function startCreate() {
    setMnemonic("");
    setConfirmedWritten(false);
    resetTransientFields();
    setStage("create-reveal");
  }

  function startRestore() {
    resetTransientFields();
    setStage("restore");
  }

  async function handleCreatePassword() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      toast.error("Password too short", { description: "Must be at least 8 characters." });
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const result = await createGrIdentity(password, mnemonic);
      setAddress(result.address);
      resetTransientFields();
      setStage("unlocked");
      toast.success("gr identity created", { description: result.address });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create gr identity.";
      setError(message);
      toast.error("Setup failed", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      toast.error("Password too short", { description: "Must be at least 8 characters." });
      return;
    }
    setBusy(true);
    try {
      const result = await restoreGrIdentity(restoreMnemonic, password);
      setAddress(result.address);
      resetTransientFields();
      setStage("unlocked");
      toast.success("gr identity restored", { description: result.address });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to restore gr identity.";
      setError(message);
      toast.error("Restore failed", { description: message });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError("");
    setBusy(true);
    try {
      await unlockGrIdentity(password);
      resetTransientFields();
      setStage("unlocked");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unlock.";
      setError(message);
      toast.error("Unlock failed", { description: message });
    } finally {
      setBusy(false);
    }
  }

  function handleLock() {
    lockGrSession();
    resetTransientFields();
    setStage("locked");
  }

  async function handleDeleteAndStartOver() {
    if (!confirm("This permanently deletes your gr identity from this browser. Without your 12-word gr recovery phrase, any future shielded tips sent to your gr address will be unrecoverable. Continue?")) {
      return;
    }
    await deleteGrIdentityCompletely();
    setAddress(null);
    resetTransientFields();
    setStage("choice");
  }

  if (stage === "checking") {
    return <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">Checking for an existing gr identity...</p>;
  }

  if (stage === "choice") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">
          Set up a <strong className="text-[#0A0A0A] dark:text-[#F5F5F5]">gr</strong> shielded identity to receive fully private V5 tips (sender, recipient, and amount all hidden). This is separate from your existing note-encryption identity.
        </p>
        <button onClick={startCreate} className={primaryButtonClass}>Create new gr identity</button>
        <button onClick={startRestore} className={secondaryButtonClass}>Restore from recovery phrase</button>
      </div>
    );
  }

  if (stage === "create-reveal") {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl p-4 bg-[#FEF9E7] dark:bg-[#2D2A15] border border-[#FDE68A] dark:border-[#5C5528]">
          <p className="text-xs font-bold text-[#92400E] dark:text-[#FDE68A] mb-1">Your gr recovery phrase</p>
          <p className="text-xs text-[#92400E] dark:text-[#D4C078]">
            Write these 12 words down somewhere safe. This is NOT the same as your note-encryption recovery phrase — it protects your gr shielded funds specifically. Anyone with these words can spend your gr notes.
          </p>
        </div>
        <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">Click below to generate your 12 words.</p>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              const { newGrMnemonic } = await import("@/lib/shielded");
              setMnemonic(newGrMnemonic());
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || mnemonic.length > 0}
          className={primaryButtonClass}
        >
          {mnemonic ? "Generated" : "Generate recovery phrase"}
        </button>
        {mnemonic && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-xl p-4 bg-[#F5F5F5] dark:bg-[#1E1E1E]">
              {mnemonic.split(" ").map((word, i) => (
                <div key={i} className="text-xs font-mono text-[#0A0A0A] dark:text-[#F5F5F5]">
                  <span className="text-[#A3A3A3] dark:text-[#6A6A6A]">{i + 1}.</span> {word}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(mnemonic);
                toast.success("Recovery phrase copied");
              }}
              className={secondaryButtonClass}
            >
              Copy phrase to clipboard
            </button>
            <label className="flex items-center gap-2 text-sm text-[#0A0A0A] dark:text-[#F5F5F5] cursor-pointer">
              <input
                type="checkbox"
                checked={confirmedWritten}
                onChange={(e) => setConfirmedWritten(e.target.checked)}
                className="w-4 h-4"
              />
              I've written this down somewhere safe
            </label>
            <button
              onClick={() => setStage("create-password")}
              disabled={!confirmedWritten}
              className={primaryButtonClass}
            >
              Continue
            </button>
          </>
        )}
      </div>
    );
  }

  if (stage === "create-password") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">Set a password to unlock your gr identity day-to-day. Your 12-word phrase remains the only true recovery path.</p>
        <input type="password" placeholder="Password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        <button onClick={handleCreatePassword} disabled={busy} className={primaryButtonClass}>
          {busy ? "Creating..." : "Finish setup"}
        </button>
      </div>
    );
  }

  if (stage === "restore") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">Enter your 12-word gr recovery phrase and set a new password for this device.</p>
        <textarea
          placeholder="word1 word2 word3 ..."
          value={restoreMnemonic}
          onChange={(e) => setRestoreMnemonic(e.target.value)}
          rows={3}
          className={inputClass}
        />
        <input type="password" placeholder="New password (min 8 characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        <button onClick={handleRestore} disabled={busy} className={primaryButtonClass}>
          {busy ? "Restoring..." : "Restore identity"}
        </button>
        <button onClick={() => setStage("choice")} className={secondaryButtonClass}>Back</button>
      </div>
    );
  }

  if (stage === "locked") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">Your gr identity is locked. Enter your password to unlock it.</p>
        {address && <p className="text-xs font-mono text-[#A3A3A3] dark:text-[#6A6A6A] break-all">{address}</p>}
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        {error && <p className="text-xs text-[#EF4444]">{error}</p>}
        <button onClick={handleUnlock} disabled={busy} className={primaryButtonClass}>
          {busy ? "Unlocking..." : "Unlock"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl p-4 bg-[#F0FDF4] dark:bg-[#132A1B] border border-[#BBF7D0] dark:border-[#265C3A]">
        <p className="text-xs font-bold text-[#166534] dark:text-[#86EFAC] mb-1">gr identity unlocked</p>
        <p className="text-xs font-mono text-[#166534] dark:text-[#86EFAC] break-all">{address}</p>
      </div>
      <button onClick={handleLock} className={secondaryButtonClass}>Lock</button>
      <button onClick={handleDeleteAndStartOver} className="text-xs text-[#EF4444] hover:underline mt-1">
        Delete this gr identity and start over
      </button>
    </div>
  );
}
