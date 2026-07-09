"use client";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "@/components/Modal";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, saveProfile, avatarUrlFor, AVATAR_VARIANTS } from "@/lib/profile";
import { lockSession } from "@/lib/encryption/keyManagement";
import ThemeToggle from "@/components/ThemeToggle";
import { useRegistryClient } from "@/lib/registryClient";

export default function ProfilePage() {
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarVariant, setAvatarVariant] = useState<string>("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [tipLink, setTipLink] = useState("");
  const [tipId, setTipId] = useState("");
  const [isPremium, setIsPremium] = useState(false);
  const { isReady: registryReady, buildRegistryClient } = useRegistryClient();

  useEffect(() => {
    const addr = localStorage.getItem("growthip:wallet") ?? "";
    if (!addr) return;
    setAddress(addr);
    const p = getProfile(addr);
    setDisplayName(p.displayName);
    setBio(p.bio);
    setAvatarVariant(p.avatarVariant);
    try {
      const id = encodeTipId(addr);
      setTipId(id);
      setTipLink(`https://growthip.vercel.app/tip/${id}`);
    } catch {}
  }, []);

  useEffect(() => {
    if (!address || !registryReady) { setIsPremium(false); return; }
    (async () => {
      try {
        const client = buildRegistryClient(address);
        const result = await client.is_premium({ recipient: address });
        setIsPremium(result.result === true);
      } catch {
        setIsPremium(false);
      }
    })();
  }, [address, registryReady, buildRegistryClient]);

  function handleSaveProfile() {
    setSavedFlash(true);
    saveProfile(address, { displayName: displayName.trim(), bio: bio.trim(), avatarVariant });
    setEditingProfile(false);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function copyAddress() {
    navigator.clipboard.writeText(tipId);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  function copyTipLink() {
    navigator.clipboard.writeText(tipLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function handleDisconnect() {
    lockSession();
    localStorage.removeItem("growthip:wallet");
    localStorage.removeItem("growthip:network");
    window.location.href = "/dashboard";
  }

  async function handleSwapWallet() {
    lockSession();
    localStorage.removeItem("growthip:wallet");
    localStorage.removeItem("growthip:network");
    window.location.href = "/dashboard";
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "24px", fontWeight: 800, margin: "0 0 4px" }}>Profile</h1>
            <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", margin: 0 }}>Manage your public creator profile</p>
          </div>
          <ThemeToggle />
        </div>

        {!address ? (
          <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#151515]" style={{ borderRadius: "16px", padding: "24px", textAlign: "center" }}>
            <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px" }}>Connect your wallet to see your profile.</p>
          </div>
        ) : (
          <>
            {/* Profile card */}
            <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#151515]" style={{ borderRadius: "16px", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <img
                  src={avatarUrlFor(address)}
                  alt="avatar"
                  width={64} height={64}
                  className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ borderRadius: "50%", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingProfile ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" maxLength={40}
                        className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "8px 10px", borderRadius: "8px", fontSize: "14px", fontWeight: 700 }} />
                      <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio (optional)" maxLength={140} rows={2}
                        className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "8px 10px", borderRadius: "8px", fontSize: "13px", resize: "none" }} />
                      <div>
                        <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "11px", fontWeight: 600, margin: "0 0 8px" }}>Avatar</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 40px)", gap: "8px" }}>
                          {AVATAR_VARIANTS.map((v) => (
                            <button key={v || "default"} onClick={() => setAvatarVariant(v)}
                              className={["bg-white dark:bg-[#1A1A1A]", avatarVariant === v ? "border-2 border-[#0A0A0A] dark:border-[#F5F5F5]" : "border border-[#E5E5E5] dark:border-[#2A2A2A]"].join(" ")} style={{ width: "40px", height: "40px", padding: "2px", borderRadius: "8px", cursor: "pointer" }}>
                              <img src={avatarUrlFor(address, v)} alt={v} width={36} height={36} style={{ width: 36, height: 36, borderRadius: "6px" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={handleSaveProfile} className="bg-[#0A0A0A] text-white" style={{ padding: "6px 14px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingProfile(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] text-[#737373] dark:text-[#8A8A8A]" style={{ padding: "6px 14px", borderRadius: "999px", background: "transparent", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "18px", fontWeight: 800 }}>{displayName || "Unnamed Creator"}</span>
                        <button onClick={() => setEditingProfile(true)} className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                          <Icon icon="ph:pencil-simple-bold" style={{ fontSize: "14px" }} />
                        </button>
                        {isPremium ? (
                          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#FFFBEB", color: "#d97706" }}>
                            <Icon icon="ph:star-four-fill" style={{ fontSize: "10px" }} /> Premium
                          </span>
                        ) : (
                          <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>
                            Free Plan
                          </span>
                        )}
                      </div>
                      {bio && <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "13px", margin: "0 0 6px" }}>{bio}</p>}
                      {savedFlash && <p style={{ fontSize: "12px", color: "#22c55e", margin: "0 0 4px" }}>Saved ✓</p>}
                      <button onClick={copyAddress} style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        <Icon icon={copiedAddress ? "ph:check-bold" : "ph:copy-simple-bold"} className={copiedAddress ? "" : "dark:text-[#6A6A6A]"} style={{ fontSize: "13px", color: copiedAddress ? "#22c55e" : "#A3A3A3" }} />
                        <span className="dark:text-[#6A6A6A]" style={{ fontSize: "11px", color: "#A3A3A3", fontFamily: "monospace" }}>
                          {tipId ? tipId.slice(0, 8) + "..." + tipId.slice(-6) : address.slice(0, 6) + "..." + address.slice(-4)}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tip link card */}
            <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#151515]" style={{ borderRadius: "16px", padding: "20px" }}>
              <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Your Tip Link</p>
              <div className="bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "10px", marginBottom: "12px" }}>
                <Icon icon="ph:link" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ flexShrink: 0 }} />
                <span className="text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ fontSize: "12px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink.replace("https://", "")}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={copyTipLink} data-copied={copiedLink ? "true" : "false"} className="flex-1 flex items-center justify-center gap-1.5 text-[13px] font-bold text-white rounded-[10px] border-none cursor-pointer transition-colors" style={{ padding: "10px", background: copiedLink ? "#16a34a" : "#0A0A0A", WebkitTextFillColor: "white" }}>
                  <Icon icon={copiedLink ? "ph:check-bold" : "ph:copy-simple-bold"} />
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
                <button onClick={() => setShowQR(true)} className="bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ padding: "10px 16px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon icon="ph:qr-code-bold" /> QR
                </button>
              </div>
            </div>

            {/* Wallet card */}
            <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#151515]" style={{ borderRadius: "16px", padding: "20px" }}>
              <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Wallet</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                <div className="bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "40px", height: "40px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon="ph:wallet-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "20px" }} />
                </div>
                <div>
                  <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 2px" }}>{address.slice(0, 6)}...{address.slice(-6)}</p>
                  <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", margin: 0 }}>Connected · Testnet</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button onClick={() => setShowWalletModal(true)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "10px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <Icon icon="ph:arrows-left-right-bold" style={{ fontSize: "15px" }} /> Switch wallet
                </button>
                <button onClick={handleDisconnect} data-disconnect className="dark:border-red-900 dark:bg-red-950" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #FEE2E2", background: "#FEF2F2", fontSize: "13px", fontWeight: 600, color: "#ef4444", WebkitTextFillColor: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <Icon icon="ph:sign-out-bold" style={{ fontSize: "15px" }} /> Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* QR Modal */}
      <Modal show={showQR} onClose={() => setShowQR(false)} maxWidth="380px">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ flex: 1 }} />
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "17px", fontWeight: 800, margin: 0, textAlign: "center", flex: 2 }}>Your QR Code</p>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowQR(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
            </button>
          </div>
        </div>
        <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "13px", margin: "0 0 20px", textAlign: "center" }}>Scan to open your tip link</p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div style={{ padding: "14px", background: "#22c55e", borderRadius: "20px" }}>
            <div className="bg-white" style={{ padding: "12px", borderRadius: "12px" }}>
              {tipLink && <QRCodeSVG value={tipLink} size={180} />}
            </div>
          </div>
          <div className="bg-[#F9FAFB] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ width: "100%", padding: "10px 14px", borderRadius: "10px" }}>
            <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "11px", margin: 0, textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <img src="/growthip-logo.png" alt="Growthip" style={{ width: "22px", height: "22px", objectFit: "contain" }} />
            <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700 }}>Growthip</span>
          </div>
        </div>
      </Modal>

      {/* Switch wallet modal */}
      <Modal show={showWalletModal} onClose={() => setShowWalletModal(false)} maxWidth="380px">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Switch Wallet</p>
          <button onClick={() => setShowWalletModal(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
          </button>
        </div>
        <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", margin: "0 0 16px" }}>Switching wallet will disconnect the current session. Your notes and profile are saved per wallet.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button onClick={handleSwapWallet} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon icon="ph:wallet-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "18px" }} /> Go to wallet selector
          </button>
          <button onClick={() => setShowWalletModal(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#737373] dark:text-[#8A8A8A]" style={{ padding: "12px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
