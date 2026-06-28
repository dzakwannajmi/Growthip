"use client";

import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { QRCodeSVG } from "qrcode.react";
import EncryptionSetup from "@/components/EncryptionSetup";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, saveProfile, avatarUrlFor, AVATAR_VARIANTS } from "@/lib/profile";

export default function SettingsPage() {
  const [address, setAddress] = useState("");
  const [showSecurity, setShowSecurity] = useState(false);

  async function handleExportBackup() {
    try {
      const { exportBackupFile } = await import("@/lib/encryption/keyManagement");
      const blob = await exportBackupFile();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `growthip-backup-${address.slice(0, 6)}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("No encryption key found. Please set up encryption first in Security & Private Notes.");
    }
  }

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarVariant, setAvatarVariant] = useState<string>("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = localStorage.getItem("growthip:wallet");
      if (stored) setAddress(stored);
    })();
  }, []);

  // Local profile (display name/bio) is per-address -- load whenever the
  // connected wallet changes.
  useEffect(() => {
    if (!address) return;
    const profile = getProfile(address);
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setAvatarVariant(profile.avatarVariant);
  }, [address]);

  function handleSaveProfile() {
    if (!address) return;
    saveProfile(address, { displayName: displayName.trim(), bio: bio.trim(), avatarVariant });
    setEditingProfile(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  const tipLink = address
    ? `https://growthip.vercel.app/tip/${encodeTipId(address)}`
    : "";

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  function copyTipLink() {
    if (!tipLink) return;
    navigator.clipboard.writeText(tipLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="p-4 md:p-8 lg:p-10 w-full min-h-full" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold" style={{ color: "#0A0A0A" }}>Settings</h1>
          <p className="text-sm" style={{ color: "#525252" }}>Manage your account preferences</p>
        </div>

        {!address ? (
          <div className="rounded-2xl p-6 text-center" style={{ border: "1px solid #E5E5E5", background: "white" }}>
            <p style={{ fontSize: "13px", color: "#737373" }}>Connect your wallet to see your profile.</p>
          </div>
        ) : (
          <>
            {/* Profile header -- real wallet data, not a placeholder */}
            <div className="rounded-2xl p-5" style={{ border: "1px solid #E5E5E5", background: "white" }}>
              <div className="flex items-start gap-4">
                <img
                  src={avatarUrlFor(address, avatarVariant)}
                  alt="Profile avatar"
                  width={64}
                  height={64}
                  className="rounded-full"
                  style={{ border: "1px solid #D4D4D4", background: "#F5F5F5", flexShrink: 0 }}
                />
                <div className="flex-1 min-w-0">
                  {editingProfile ? (
                    <div className="flex flex-col gap-2">
                      <input
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Display name"
                        maxLength={40}
                        style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "14px", fontWeight: 700 }}
                      />
                      <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Short bio (optional)"
                        maxLength={140}
                        rows={2}
                        style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px", resize: "none" }}
                      />
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: "#737373" }}>Avatar</p>
                        <div className="grid grid-cols-5 gap-2" style={{ justifyContent: "start", width: "max-content" }}>
                          {AVATAR_VARIANTS.map((v) => (
                            <button
                              key={v || "default"}
                              onClick={() => setAvatarVariant(v)}
                              title={v ? `Variant ${v}` : "Default"}
                              style={{
                                width: "40px",
                                height: "40px",
                                padding: "2px",
                                borderRadius: "8px",
                                border: avatarVariant === v ? "2px solid #0A0A0A" : "1px solid #E5E5E5",
                                background: "white",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              <img
                                src={avatarUrlFor(address, v)}
                                alt={v || "default"}
                                width={36}
                                height={36}
                                style={{ width: 36, height: 36, borderRadius: "6px" }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveProfile}
                          style={{ padding: "6px 14px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer" }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingProfile(false)}
                          style={{ padding: "6px 14px", borderRadius: "999px", background: "transparent", color: "#737373", fontSize: "12px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="font-bold text-lg truncate" style={{ color: "#0A0A0A" }}>
                          {displayName || "Unnamed Creator"}
                        </div>
                        <button
                          onClick={() => setEditingProfile(true)}
                          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#A3A3A3" }}
                          aria-label="Edit profile"
                        >
                          <Icon icon="ph:pencil-simple-bold" style={{ fontSize: "14px" }} />
                        </button>
                      </div>
                      {bio && (
                        <p className="text-sm mt-1" style={{ color: "#525252" }}>{bio}</p>
                      )}
                      {savedFlash && (
                        <p className="text-xs mt-1" style={{ color: "#22C55E" }}>Saved</p>
                      )}
                    </>
                  )}

                  {/* Address: truncated display, click to copy, full
                      address available via title attribute on hover. */}
                  <button
                    onClick={copyAddress}
                    title={address}
                    className="text-xs flex items-center gap-1 mt-2"
                    style={{ color: "#737373", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", padding: 0 }}
                  >
                    <Icon icon={copiedAddress ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ color: copiedAddress ? "#22C55E" : "#A3A3A3" }} />
                    {address.slice(0, 6)}...{address.slice(-6)}
                  </button>
                </div>
              </div>
            </div>

            {/* Tip link card */}
            <div className="rounded-2xl p-5" style={{ border: "1px solid #E5E5E5", background: "white" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#737373" }}>
                Your Tip Link
              </p>
              <div className="flex items-center gap-2 mb-3" style={{ padding: "10px 12px", borderRadius: "10px", background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                <Icon icon="ph:link" style={{ color: "#737373", flexShrink: 0 }} />
                <span className="text-sm truncate" style={{ color: "#0A0A0A", fontFamily: "monospace" }}>
                  {tipLink.replace("https://", "")}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={copyTipLink}
                  className="flex-1 flex items-center justify-center gap-2"
                  style={{ padding: "10px", borderRadius: "10px", background: copiedLink ? "#22C55E" : "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer" }}
                >
                  <Icon icon={copiedLink ? "ph:check-bold" : "ph:copy-simple-bold"} />
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
                <button
                  onClick={() => setShowQR((p) => !p)}
                  className="flex items-center justify-center gap-2"
                  style={{ padding: "10px 16px", borderRadius: "10px", background: "white", color: "#0A0A0A", fontSize: "13px", fontWeight: 700, border: "1px solid #E5E5E5", cursor: "pointer" }}
                >
                  <Icon icon="ph:qr-code-bold" />
                  QR
                </button>
              </div>
              {showQR && (
                <div className="flex flex-col items-center gap-2 mt-3" style={{ padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                  <div style={{ background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #E5E5E5" }}>
                    <QRCodeSVG value={tipLink} size={160} level="M" />
                  </div>
                  <p className="text-xs text-center" style={{ color: "#737373" }}>
                    Share this on stream, in your bio, or print it.
                  </p>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#737373" }}>Preferences</p>
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E5E5E5", background: "white" }}>
                <button onClick={handleExportBackup} className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#FAFAFA]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                      <Icon icon="ph:download-simple-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm" style={{ color: "#0A0A0A" }}>Export Backup</div>
                      <div className="text-xs" style={{ color: "#737373" }}>Download your encryption key backup · Required to recover on new device</div>
                    </div>
                  </div>
                  <Icon icon="ph:caret-right-bold" style={{ color: "#A3A3A3" }} />
                </button>
                <div style={{ height: "1px", background: "#E5E5E5" }} />
                <button onClick={() => setShowSecurity((p) => !p)} className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#FAFAFA]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "#F5F5F5" }}>
                      <Icon icon="ph:shield-check-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm" style={{ color: "#0A0A0A" }}>Security & Private Notes</div>
                      <div className="text-xs" style={{ color: "#737373" }}>Enable encrypted notes from supporters · Est. fee ~0.016 XLM</div>
                    </div>
                  </div>
                  <Icon icon={showSecurity ? "ph:caret-up-bold" : "ph:caret-right-bold"} style={{ color: "#A3A3A3" }} />
                </button>
              </div>
            </div>

            {showSecurity && (
              <div className="rounded-2xl p-4" style={{ border: "1px solid #E5E5E5", background: "white" }}>
                <EncryptionSetup address={address} />
              </div>
            )}
            {/* About section */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#737373" }}>About</p>
              <div className="rounded-2xl p-4" style={{ border: "1px solid #E5E5E5", background: "white" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>Growthip</span>
                    <span style={{ fontSize: "12px", color: "#737373" }}>V4 · Testnet</span>
                  </div>
                  <p style={{ fontSize: "12px", color: "#737373", lineHeight: 1.6 }}>
                    Privacy-preserving creator tipping on Stellar Soroban. Zero-knowledge proofs via Groth16 BN254 — nobody knows who tipped who.
                  </p>
                  <div style={{ height: "1px", background: "#E5E5E5" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em" }}>Protocol</p>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#737373" }}>ZK Circuit</span>
                      <span style={{ fontSize: "12px", color: "#0A0A0A", fontWeight: 600 }}>Groth16 BN254 depth-20</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#737373" }}>Max deposits</span>
                      <span style={{ fontSize: "12px", color: "#0A0A0A", fontWeight: 600 }}>1,048,576 per pool</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "12px", color: "#737373" }}>Platform fee</span>
                      <span style={{ fontSize: "12px", color: "#0A0A0A", fontWeight: 600 }}>1% per claim</span>
                    </div>
                  </div>
                  <div style={{ height: "1px", background: "#E5E5E5" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contracts (Testnet)</p>
                    {[
                      { label: "Verifier V4", value: "CB4HXIP...OUD3PY63" },
                      { label: "Pool XLM", value: "CB5LA7R...FTXWAAQ" },
                      { label: "Pool USDC", value: "CBEQAUR...KAU7SOO" },
                      { label: "Registry", value: "CDX52AC...SRGNU" },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: "12px", color: "#737373" }}>{label}</span>
                        <span style={{ fontSize: "11px", color: "#0A0A0A", fontWeight: 600, fontFamily: "monospace" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: "1px", background: "#E5E5E5" }} />
                  <div style={{ display: "flex", gap: "8px" }}>
                    <a href="https://github.com/dzakwannajmi/Growthip" target="_blank" rel="noreferrer"
                      style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid #E5E5E5", background: "#FAFAFA", fontSize: "12px", fontWeight: 600, color: "#0A0A0A", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <Icon icon="ph:github-logo-bold" style={{ fontSize: "14px" }} /> GitHub
                    </a>
                    <a href="https://growthip.vercel.app" target="_blank" rel="noreferrer"
                      style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "1px solid #E5E5E5", background: "#FAFAFA", fontSize: "12px", fontWeight: 600, color: "#0A0A0A", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      <Icon icon="ph:globe-bold" style={{ fontSize: "14px" }} /> Live
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}