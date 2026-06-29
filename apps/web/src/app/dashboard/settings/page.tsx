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
    <div className="p-4 md:p-8 lg:p-10 w-full min-h-full" className="dark:bg-[#0A0A0A]" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-[#0A0A0A] dark:text-[#FAFAFA]">Settings</h1>
          <p className="text-sm text-[#525252] dark:text-[#8A8A8A]">Manage your account preferences</p>
        </div>

        {!address ? (
          <div className="rounded-2xl p-6 text-center" style={{ border: "1px solid #E5E5E5", background: "white" }}>
            <p style={{ fontSize: "13px", color: "#737373" }}>Connect your wallet to see your profile.</p>
          </div>
        ) : (<>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3 text-[#737373] dark:text-[#6A6A6A]">Preferences</p>
              <div className="rounded-2xl overflow-hidden dark:bg-[#1A1A1A] dark:border-[#2A2A2A]" style={{ border: "1px solid #E5E5E5", background: "white" }}>
                <button onClick={handleExportBackup} className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#F5F5F5] dark:hover:bg-[#2A2A2A]">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center dark:bg-[#2A2A2A]" style={{ background: "#F5F5F5" }}>
                      <Icon icon="ph:download-simple-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm" className="text-[#0A0A0A] dark:text-[#FAFAFA]">Export Backup</div>
                      <div className="text-xs" style={{ color: "#737373" }}>Download your encryption key backup · Required to recover on new device</div>
                    </div>
                  </div>
                  <Icon icon="ph:caret-right-bold" style={{ color: "#A3A3A3" }} />
                </button>
                <div className="dark:bg-[#2A2A2A]" style={{ height: "1px", background: "#E5E5E5" }} />
                <button onClick={() => setShowSecurity((p) => !p)} className="w-full p-4 flex items-center justify-between transition-colors hover:bg-[#F5F5F5] dark:hover:bg-[#2A2A2A] rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center dark:bg-[#2A2A2A]" style={{ background: "#F5F5F5" }}>
                      <Icon icon="ph:shield-check-bold" className="text-xl" style={{ color: "#0A0A0A" }} />
                    </div>
                    <div className="text-left">
                      <div className="font-bold text-sm" className="text-[#0A0A0A] dark:text-[#FAFAFA]">Security & Private Notes</div>
                      <div className="text-xs" style={{ color: "#737373" }}>Enable encrypted notes from supporters · Est. fee ~0.016 XLM</div>
                    </div>
                  </div>
                  <Icon icon={showSecurity ? "ph:caret-up-bold" : "ph:caret-right-bold"} style={{ color: "#A3A3A3" }} />
                </button>
              </div>
            </div>

            {showSecurity && (
              <div className="rounded-2xl p-4 dark:bg-[#1A1A1A] dark:border-[#2A2A2A]" style={{ border: "1px solid #E5E5E5", background: "white" }}>
                <EncryptionSetup address={address} />
              </div>
            )}
            {/* Supported Tokens section */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-3 text-[#737373] dark:text-[#6A6A6A]">Supported Tokens</p>
              <div className="rounded-2xl dark:bg-[#1A1A1A] dark:border-[#2A2A2A]" style={{ border: "1px solid #E5E5E5", background: "white", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon="ph:coins-bold" style={{ fontSize: "18px", color: "#F59E0B" }} />
                  </div>
                  <div>
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 1px" }}>Available Tokens</p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>Stellar tokens you can receive as tips</p>
                  </div>
                </div>
                {/* Token list */}
                {[
                  { icon: "cryptocurrency-color:xlm", name: "XLM", fullName: "Stellar Lumens", standard: "Native", decimals: 7, baseTip: "10 XLM", fee: "~0.00001 XLM", available: true },
                  { icon: "cryptocurrency-color:usdc", name: "USDC", fullName: "USD Coin (Circle)", standard: "SEP-24", decimals: 7, baseTip: "2 USDC", fee: "~0.00001 XLM", available: true },
                  { icon: "cryptocurrency-color:eur", name: "EURC", fullName: "Euro Coin (Circle)", standard: "SEP-24", decimals: 7, baseTip: "2 EURC", fee: "~0.00001 XLM", available: false },
                  { icon: "twemoji:flag-indonesia", name: "IDRT", fullName: "Rupiah Token (KBTrading)", standard: "SEP-24", decimals: 2, baseTip: "Rp50,000", fee: "~0.00001 XLM", available: false },
                ].map((token, i, arr) => (
                  <div key={token.name} style={{ padding: "14px 16px", borderBottom: i < arr.length - 1 ? "1px solid #F5F5F5" : "none", opacity: token.available ? 1 : 0.55, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Icon icon={token.icon} style={{ fontSize: "36px" }} />
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                          <p className="text-[#0A0A0A] dark:text-[#FAFAFA] text-sm font-bold" style={{ margin: 0 }}>{token.name}</p>
                          <span className="dark:bg-[#2A2A2A] dark:text-[#8A8A8A]" style={{ fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px", background: "#F5F5F5", color: "#737373" }}>{token.standard}</span>
                        </div>
                        <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>{token.fullName}</p>
                      </div>
                    </div>
                    {token.available
                      ? <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "12px", color: "#737373", margin: "0 0 2px" }}>Fee: {token.fee}</p>
                          <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>{token.decimals} decimals</p>
                        </div>
                      : <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "#F5F5F5", color: "#A3A3A3" }}>Coming soon</span>
                    }
                  </div>
                ))}
              </div>
            </div>
        </>
        )}
      </div>
    </div>
  );
}