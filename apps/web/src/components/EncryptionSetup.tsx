"use client";

/**
 * EncryptionSetup.tsx
 *
 * Full setup flow for Growthip's premium private-note encryption:
 *   1. Password entry (+ strength meter)
 *   2. Recovery phrase reveal + 3-word confirmation
 *   3. Payment (6 XLM) + on-chain pubkey registration
 *   4. Backup file download + recovery-phrase QR code
 *
 * Also handles the "device without local identity, but registry already
 * shows is_premium=true" case explicitly -- offering Restore (from
 * backup file or recovery phrase) instead of silently generating and
 * overwriting a brand new key, which would permanently orphan any notes
 * encrypted under the old key.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";
import { useRegistryClient } from "@/lib/registryClient";
import {
  createIdentity,
  importBackupFile,
  unlockWithPassword,
  unlockWithRecoveryPhrase,
  getStoredPublicKeyRaw,
} from "@/lib/encryption/keyManagement";
import { hasIdentity } from "@/lib/encryption/storage";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Very small, dependency-free password strength heuristic. Not a
 * substitute for the actual security (Argon2id + 64MB memory cost
 * already does the heavy lifting) -- purely a UX nudge so users don't
 * pick something trivially guessable. */
function estimatePasswordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string; color: string } {
  if (password.length === 0) return { score: 0, label: "", color: "#E5E5E5" };
  let points = 0;
  if (password.length >= 8) points++;
  if (password.length >= 14) points++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) points++;
  if (/[0-9]/.test(password)) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;

  if (points <= 1) return { score: 1, label: "Weak", color: "#EF4444" };
  if (points <= 3) return { score: 2, label: "Okay", color: "#F59E0B" };
  return { score: 3, label: "Strong", color: "#22C55E" };
}

type Step =
  | "checking"
  | "intro"
  | "existing-elsewhere" // is_premium=true on-chain, but no local identity
  | "password"
  | "recovery-reveal"
  | "recovery-confirm"
  | "paying"
  | "backup"
  | "restore-password"
  | "restore-file"
  | "done"
  | "rotate-confirm";

interface EncryptionSetupProps {
  address: string;
  onComplete?: () => void;
}

export default function EncryptionSetup({ address, onComplete }: EncryptionSetupProps) {
  const { isReady, buildRegistryClient } = useRegistryClient();

  const [step, setStep] = useState<Step>("checking");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [confirmWords, setConfirmWords] = useState<{ index: number; value: string }[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const strength = estimatePasswordStrength(password);

  // On mount: figure out which of the three states we're in.
  useEffect(() => {
    if (!isReady) return;
    (async () => {
      const localIdentityExists = await hasIdentity();

      try {
        const client = buildRegistryClient(address);
        const premiumResult = await client.is_premium({ recipient: address });
        const isPremiumOnChain = premiumResult.result === true;

        if (localIdentityExists && isPremiumOnChain) {
          // Both local identity and on-chain premium exist — fully set up
          setStep("done");
          onComplete?.();
          return;
        } else if (localIdentityExists && !isPremiumOnChain) {
          // Local identity exists but not premium on-chain — stale identity
          // from a different wallet. Show intro so user can activate.
          setStep("intro");
        } else if (!localIdentityExists && isPremiumOnChain) {
          // Premium on-chain but no local identity — new device or cleared storage
          setStep("existing-elsewhere");
        } else {
          setStep("intro");
        }
      } catch (err) {
        console.error("Failed to check premium status:", err);
        setStep("intro");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, address]);

  async function handleCreatePassword() {
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      toast.error("Password too short", { description: "Must be at least 8 characters." });
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      // We don't actually call createIdentity() yet -- recovery phrase
      // confirmation happens first, then identity creation, so the user
      // can't lock themselves out before they've proven they saved the
      // phrase. We peek at a freshly generated phrase here for display
      // purposes only by calling createIdentity() now and treating
      // "confirm" as a soft gate before we move on to payment -- the
      // identity is already safely wrapped+stored at this point
      // regardless, since createIdentity() handles wrapping atomically.
      const result = await createIdentity(password);
      setRecoveryPhrase(result.recoveryPhrase);
      const words = result.recoveryPhrase.split(" ");
      const randomIndices = [...Array(words.length).keys()]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .sort((a, b) => a - b);
      setConfirmWords(randomIndices.map((index) => ({ index, value: "" })));
      setStep("recovery-reveal");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create identity.");
      toast.error("Setup failed", { description: err instanceof Error ? err.message : "Failed to create identity." });
    } finally {
      setBusy(false);
    }
  }

  function handleConfirmRecovery() {
    setError("");
    const words = recoveryPhrase.split(" ");
    const allCorrect = confirmWords.every(
      ({ index, value }) => value.trim().toLowerCase() === words[index],
    );
    if (!allCorrect) {
      setError("One or more words don't match. Check your written copy and try again.");
    toast.error("Recovery phrase mismatch", { description: "Check your written copy and try again." });
      return;
    }
    setStep("paying");
  }

  async function handlePayAndRegister() {
    setError("");
    setBusy(true);
    try {
      const publicKeyRaw = await getStoredPublicKeyRaw();
      if (!publicKeyRaw) throw new Error("No local public key found -- this shouldn't happen.");

      const client = buildRegistryClient(address);
      const tx = await client.register_encryption_pubkey({
        recipient: address,
        pubkey: Buffer.from(publicKeyRaw),
      });
      await tx.signAndSend({ force: true });

      setStep("backup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment or registration failed.");
      toast.error("Payment failed", { description: err instanceof Error ? err.message : "Payment or registration failed." });
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadBackup() {
    const { exportBackupFile } = await import("@/lib/encryption/keyManagement");
    const blob = await exportBackupFile();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `growthip-backup-${address.slice(0, 6)}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleRestoreWithPassword() {
    setError("");
    setBusy(true);
    try {
      // The backup file itself must already exist in this browser's
      // IndexedDB for unlockWithPassword to have anything to unwrap --
      // this path is for the case where the user is re-deriving access
      // immediately after importBackupFile() in the same session.
      await unlockWithPassword(restorePassword);
      setStep("done");
      onComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock.");
      toast.error("Unlock failed", { description: err instanceof Error ? err.message : "Failed to unlock." });
    } finally {
      setBusy(false);
    }
  }

  async function handleRestoreFromFile() {
    setError("");
    if (!restoreFile) {
      setError("Choose a backup file first.");
      toast.error("No file selected", { description: "Choose a backup file first." });
      return;
    }
    setBusy(true);
    try {
      await importBackupFile(restoreFile);
      setStep("restore-password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid backup file.");
      toast.error("Restore failed", { description: err instanceof Error ? err.message : "Invalid backup file." });
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------- */

  if (step === "checking" || !isReady) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <Icon icon="ph:spinner-bold" style={{ fontSize: "24px", color: "#A3A3A3" }} />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #D1FAE5", background: "#F0FDF4", display: "flex", alignItems: "center", gap: "10px" }}>
          <Icon icon="ph:check-circle-bold" style={{ fontSize: "20px", color: "#22C55E" }} />
          <div>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#171717" }}>Private notes are active</p>
            <p style={{ fontSize: "12px", color: "#737373" }}>Your encryption key is set up on this device.</p>
          </div>
        </div>
        <button
          onClick={() => setStep("rotate-confirm")}
          style={{ padding: "10px 14px", borderRadius: "10px", background: "transparent", color: "#737373", fontSize: "12px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer", textAlign: "left" }}
        >
          🔄 Update encryption key (if your on-chain key is out of sync)
        </button>
      </div>
    );
  }

  if (step === "rotate-confirm") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2" }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#EF4444" }}>⚠️ This will replace your local encryption key</p>
          <p style={{ fontSize: "12px", color: "#737373", marginTop: "4px" }}>
            A new key will be generated and registered on-chain. Old encrypted notes (from before this update) will no longer be decryptable. Only do this if your on-chain key is out of sync with this browser.
          </p>
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password for your key..."
          style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px" }}
        />
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={async () => {
              setError("");
              if (password.length < 8) { setError("Password must be at least 8 characters."); toast.error("Password too short", { description: "Must be at least 8 characters." }); return; }
              setBusy(true);
              try {
                const { rotateIdentity } = await import("@/lib/encryption/keyManagement");
                const { publicKeyRaw } = await rotateIdentity(password);
                // Re-register new pubkey on-chain (free -- already premium)
                const client = buildRegistryClient(address);
                const tx = await client.register_encryption_pubkey({
                  recipient: address,
                  pubkey: Buffer.from(publicKeyRaw),
                });
                await tx.signAndSend({ force: true });
                setPassword("");
                setStep("done");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Key rotation failed.");
                toast.error("Key update failed", { description: err instanceof Error ? err.message : "Key rotation failed." });
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy || password.length < 8}
            style={{ flex: 1, padding: "10px", borderRadius: "10px", background: "#EF4444", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy || password.length < 8 ? 0.5 : 1 }}
          >
            {busy ? "Updating..." : "Update Key"}
          </button>
          <button
            onClick={() => { setPassword(""); setStep("done"); }}
            style={{ padding: "10px 16px", borderRadius: "10px", background: "transparent", color: "#737373", fontSize: "13px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (step === "existing-elsewhere") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #FDE68A", background: "#FFFBEB" }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#92400E" }}>Premium already active on another device</p>
          <p style={{ fontSize: "12px", color: "#737373", marginTop: "4px" }}>
            This wallet already activated private notes elsewhere. Restore your existing key here instead of creating a new one -- creating a new one will make old notes unreadable forever.
          </p>
        </div>
        <button onClick={() => setStep("restore-file")} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          Restore from backup file
        </button>
      </div>
    );
  }

  if (step === "restore-file") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ fontSize: "13px", color: "#525252" }}>Select your <code>growthip-backup-*.json</code> file.</p>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: "12px" }}
        />
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <button onClick={handleRestoreFromFile} disabled={busy} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Restoring..." : "Continue"}
        </button>
      </div>
    );
  }

  if (step === "restore-password") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ fontSize: "13px", color: "#525252" }}>Enter your password to unlock.</p>
        <input
          type="password"
          value={restorePassword}
          onChange={(e) => setRestorePassword(e.target.value)}
          style={{ padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px" }}
        />
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <button onClick={handleRestoreWithPassword} disabled={busy} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          {busy ? "Unlocking..." : "Unlock"}
        </button>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#171717" }}>Enable Private Notes</p>
          <p style={{ fontSize: "12px", color: "#737373", marginTop: "4px", lineHeight: 1.6 }}>
            One-time activation: 6 XLM. Lets supporters send you end-to-end encrypted notes,
            and unlocks Analytics. This is a one-time payment per wallet, not per token.
          </p>
        </div>
        <button onClick={() => setStep("password")} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          Get Started
        </button>
      </div>
    );
  }

  if (step === "password") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#525252", marginBottom: "6px" }}>Choose a password</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px" }}
          />
          {password.length > 0 && (
            <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: "#E5E5E5", overflow: "hidden" }}>
                <div style={{ width: `${(strength.score / 3) * 100}%`, height: "100%", background: strength.color }} />
              </div>
              <span style={{ fontSize: "11px", color: strength.color, fontWeight: 600 }}>{strength.label}</span>
            </div>
          )}
        </div>
        <div>
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#525252", marginBottom: "6px" }}>Confirm password</p>
          <input
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px" }}
          />
        </div>
        <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p style={{ fontSize: "11px", color: "#991B1B" }}>
            This password cannot be recovered by Growthip if you lose it. You will also get a recovery phrase as a backup.
          </p>
        </div>
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <button onClick={handleCreatePassword} disabled={busy} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Setting up..." : "Continue"}
        </button>
      </div>
    );
  }

  if (step === "recovery-reveal") {
    const words = recoveryPhrase.split(" ");
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon icon="ph:key-bold" className="text-xl text-[#0A0A0A] dark:text-[#F5F5F5]" />
          <p className="text-sm font-bold text-[#171717] dark:text-[#F0F0F0]">Your recovery phrase</p>
        </div>
        <p className="text-xs leading-relaxed text-[#737373] dark:text-[#8A8A8A]">
          Write these 12 words down, in order, somewhere safe and offline. Anyone with this phrase can read your private notes.
        </p>

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A] p-3.5">
          {words.map((word, i) => (
            <div key={i} className="font-mono text-xs text-[#171717] dark:text-[#E5E5E5]">
              <span className="text-[#A3A3A3] dark:text-[#6A6A6A]">{i + 1}.</span> {word}
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-2 rounded-xl border border-[#E5E5E5] dark:border-[#2A2A2A] p-4">
          <QRCodeSVG value={recoveryPhrase} size={160} level="M" />
          <p className="text-[11px] text-[#A3A3A3] dark:text-[#6A6A6A]">Scan to save (do this on a separate, offline device)</p>
        </div>

        <div className="flex gap-2.5 rounded-xl border border-[#BFDBFE] dark:border-[#1E3A5F] bg-[#EFF6FF] dark:bg-[#0D1F2B] p-3.5">
          <Icon icon="ph:info-bold" className="mt-0.5 shrink-0 text-base text-[#2563EB] dark:text-[#5B9BF5]" />
          <p className="text-[11px] leading-relaxed text-[#1E40AF] dark:text-[#8FB8F0]">
            This phrase alone isn&apos;t the full picture. After payment, you&apos;ll also get a <strong>backup file</strong> — you need BOTH if you ever switch devices or clear your browser. This phrase without that file (or vice versa) won&apos;t be enough to unlock future tips.
          </p>
        </div>

        <button
          onClick={() => setStep("recovery-confirm")}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] px-3 py-3 text-sm font-bold text-white"
        >
          <Icon icon="ph:check-bold" className="text-base" />
          I&apos;ve written it down
        </button>
      </div>
    );
  }

  if (step === "recovery-confirm") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#171717" }}>Confirm your recovery phrase</p>
        <p style={{ fontSize: "12px", color: "#737373" }}>Enter the requested words to confirm you saved them correctly.</p>
        {confirmWords.map((cw, i) => (
          <div key={cw.index}>
            <p style={{ fontSize: "12px", fontWeight: 600, color: "#525252", marginBottom: "4px" }}>Word #{cw.index + 1}</p>
            <input
              value={cw.value}
              onChange={(e) => {
                const updated = [...confirmWords];
                updated[i] = { ...cw, value: e.target.value };
                setConfirmWords(updated);
              }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px" }}
            />
          </div>
        ))}
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <button onClick={handleConfirmRecovery} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
          Confirm
        </button>
      </div>
    );
  }

  if (step === "paying") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <p style={{ fontSize: "13px", fontWeight: 700, color: "#171717" }}>Activate Premium</p>
        <p style={{ fontSize: "12px", color: "#737373" }}>
          One-time 6 XLM payment to publish your encryption key on-chain. Approve in your wallet.
        </p>
        {error && <p style={{ fontSize: "12px", color: "#EF4444" }}>{error}</p>}
        <button onClick={handlePayAndRegister} disabled={busy} style={{ padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? "Processing..." : "Pay 6 XLM & Activate"}
        </button>
      </div>
    );
  }

  if (step === "backup") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#D1FAE5] dark:border-[#1F4A2E] bg-[#F0FDF4] dark:bg-[#12271A] p-3.5">
          <Icon icon="ph:check-circle-bold" className="text-xl text-[#22C55E]" />
          <p className="text-sm font-bold text-[#171717] dark:text-[#F0F0F0]">Premium activated!</p>
        </div>

        {/* Two-layer explainer -- this is the part people get confused
            about: the recovery phrase from the previous step and this
            backup file protect two DIFFERENT things, and you need both
            together to recover access on a new device. */}
        <div className="rounded-xl border border-[#E5E5E5] dark:border-[#2A2A2A] p-3.5">
          <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[#A3A3A3] dark:text-[#6A6A6A]">
            One last, critical step
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] dark:bg-[#2A2A2A]">
                <Icon icon="ph:key-bold" className="text-sm text-[#525252] dark:text-[#B0B0B0]" />
              </div>
              <p className="text-xs leading-relaxed text-[#525252] dark:text-[#B0B0B0]">
                <strong className="text-[#171717] dark:text-[#F0F0F0]">Your password / recovery phrase</strong> — the key. You already have this.
              </p>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] dark:bg-[#2A2A2A]">
                <Icon icon="ph:file-lock-bold" className="text-sm text-[#525252] dark:text-[#B0B0B0]" />
              </div>
              <p className="text-xs leading-relaxed text-[#525252] dark:text-[#B0B0B0]">
                <strong className="text-[#171717] dark:text-[#F0F0F0]">This backup file</strong> — the lock itself. Without downloading it now, your key only exists in this browser.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-2.5 rounded-xl border border-[#FDE68A] dark:border-[#4A3A0D] bg-[#FFFBEB] dark:bg-[#2B220D] p-3.5">
          <Icon icon="ph:warning-circle-bold" className="mt-0.5 shrink-0 text-base text-[#D97706]" />
          <p className="text-[11px] leading-relaxed text-[#92400E] dark:text-[#D4A15C]">
            If you switch devices or clear this browser&apos;s data <strong>without</strong> this file downloaded, future tips sent to you can never be decrypted — not even with your recovery phrase alone. This isn&apos;t optional.
          </p>
        </div>

        <button
          onClick={handleDownloadBackup}
          className="flex items-center justify-center gap-2 rounded-xl border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] px-3 py-3 text-sm font-bold text-[#171717] dark:text-[#F0F0F0]"
        >
          <Icon icon="ph:download-simple-bold" className="text-base" />
          Download Backup File
        </button>
        <button
          onClick={() => { setStep("done"); onComplete?.(); }}
          className="rounded-xl bg-[#0A0A0A] px-3 py-3 text-sm font-bold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  return null;
}