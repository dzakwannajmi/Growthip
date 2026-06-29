"use client";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, saveProfile, avatarUrlFor, AVATAR_VARIANTS } from "@/lib/profile";
import { lockSession } from "@/lib/encryption/keyManagement";

function Modal({ show, onClose, children }: { show: boolean; onClose: () => void; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (show) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [show]);
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "420px", padding: "24px", transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(20px)", opacity: visible ? 1 : 0, transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
        {children}
      </div>
    </div>
  );
}

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
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <div style={{ width: "100%", maxWidth: "480px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 4px" }}>Profile</h1>
          <p style={{ fontSize: "13px", color: "#737373", margin: 0 }}>Manage your public creator profile</p>
        </div>

        {!address ? (
          <div style={{ borderRadius: "16px", padding: "24px", textAlign: "center", border: "1px solid #E5E5E5", background: "white" }}>
            <p style={{ fontSize: "13px", color: "#737373" }}>Connect your wallet to see your profile.</p>
          </div>
        ) : (
          <>
            {/* Profile card */}
            <div style={{ borderRadius: "16px", padding: "20px", border: "1px solid #E5E5E5", background: "white" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "16px" }}>
                <img
                  src={avatarUrlFor(address)}
                  alt="avatar"
                  width={64} height={64}
                  style={{ borderRadius: "50%", border: "1px solid #E5E5E5", background: "#F5F5F5", flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingProfile ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" maxLength={40}
                        style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "14px", fontWeight: 700 }} />
                      <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Short bio (optional)" maxLength={140} rows={2}
                        style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #E5E5E5", fontSize: "13px", resize: "none" }} />
                      <div>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#737373", margin: "0 0 8px" }}>Avatar</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 40px)", gap: "8px" }}>
                          {AVATAR_VARIANTS.map((v) => (
                            <button key={v || "default"} onClick={() => setAvatarVariant(v)}
                              style={{ width: "40px", height: "40px", padding: "2px", borderRadius: "8px", border: avatarVariant === v ? "2px solid #0A0A0A" : "1px solid #E5E5E5", background: "white", cursor: "pointer" }}>
                              <img src={avatarUrlFor(address, v)} alt={v} width={36} height={36} style={{ width: 36, height: 36, borderRadius: "6px" }} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button onClick={handleSaveProfile} style={{ padding: "6px 14px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingProfile(false)} style={{ padding: "6px 14px", borderRadius: "999px", background: "transparent", color: "#737373", fontSize: "12px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A" }}>{displayName || "Unnamed Creator"}</span>
                        <button onClick={() => setEditingProfile(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#A3A3A3", padding: 0 }}>
                          <Icon icon="ph:pencil-simple-bold" style={{ fontSize: "14px" }} />
                        </button>
                      </div>
                      {bio && <p style={{ fontSize: "13px", color: "#525252", margin: "0 0 6px" }}>{bio}</p>}
                      {savedFlash && <p style={{ fontSize: "12px", color: "#22c55e", margin: "0 0 4px" }}>Saved ✓</p>}
                      <button onClick={copyAddress} style={{ display: "flex", alignItems: "center", gap: "4px", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                        <Icon icon={copiedAddress ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "13px", color: copiedAddress ? "#22c55e" : "#A3A3A3" }} />
                        <span style={{ fontSize: "11px", color: "#A3A3A3", fontFamily: "monospace" }}>
                          {tipId ? tipId.slice(0, 8) + "..." + tipId.slice(-6) : address.slice(0, 6) + "..." + address.slice(-4)}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Tip link card */}
            <div style={{ borderRadius: "16px", padding: "20px", border: "1px solid #E5E5E5", background: "white" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Your Tip Link</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "10px", background: "#FAFAFA", border: "1px solid #E5E5E5", marginBottom: "12px" }}>
                <Icon icon="ph:link" style={{ color: "#A3A3A3", flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: "#0A0A0A", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink.replace("https://", "")}</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={copyTipLink} style={{ flex: 1, padding: "10px", borderRadius: "10px", background: copiedLink ? "#22c55e" : "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <Icon icon={copiedLink ? "ph:check-bold" : "ph:copy-simple-bold"} />
                  {copiedLink ? "Copied!" : "Copy Link"}
                </button>
                <button onClick={() => setShowQR(true)} style={{ padding: "10px 16px", borderRadius: "10px", background: "white", color: "#0A0A0A", fontSize: "13px", fontWeight: 700, border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Icon icon="ph:qr-code-bold" /> QR
                </button>
              </div>
            </div>

            {/* Wallet card */}
            <div style={{ borderRadius: "16px", padding: "20px", border: "1px solid #E5E5E5", background: "white" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>Wallet</p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon="ph:wallet-bold" style={{ fontSize: "20px", color: "#525252" }} />
                </div>
                <div>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 2px" }}>{address.slice(0, 6)}...{address.slice(-6)}</p>
                  <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>Connected · Testnet</p>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <button onClick={() => setShowWalletModal(true)} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <Icon icon="ph:arrows-left-right-bold" style={{ fontSize: "15px" }} /> Switch wallet
                </button>
                <button onClick={handleDisconnect} style={{ padding: "10px", borderRadius: "10px", border: "1px solid #FEE2E2", background: "#FEF2F2", fontSize: "13px", fontWeight: 600, color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <Icon icon="ph:sign-out-bold" style={{ fontSize: "15px" }} /> Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* QR Modal */}
      <Modal show={showQR} onClose={() => setShowQR(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ flex: 1 }} />
          <p style={{ fontSize: "17px", fontWeight: 800, color: "#0A0A0A", margin: 0, textAlign: "center", flex: 2 }}>Your QR Code</p>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowQR(false)} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#737373" }} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: "13px", color: "#A3A3A3", margin: "0 0 20px", textAlign: "center" }}>Scan to open your tip link</p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
          <div style={{ padding: "14px", background: "#22c55e", borderRadius: "20px" }}>
            <div style={{ padding: "12px", background: "white", borderRadius: "12px" }}>
              {tipLink && <QRCodeSVG value={tipLink} size={180} />}
            </div>
          </div>
          <div style={{ width: "100%", padding: "10px 14px", background: "#F9FAFB", borderRadius: "10px", border: "1px solid #E5E5E5" }}>
            <p style={{ fontSize: "11px", color: "#525252", margin: 0, textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <img src="/growthip-logo.png" alt="Growthip" style={{ width: "22px", height: "22px", objectFit: "contain" }} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>Growthip</span>
          </div>
        </div>
      </Modal>

      {/* Switch wallet modal */}
      <Modal show={showWalletModal} onClose={() => setShowWalletModal(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p style={{ fontSize: "16px", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Switch Wallet</p>
          <button onClick={() => setShowWalletModal(false)} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#737373" }} />
          </button>
        </div>
        <p style={{ fontSize: "13px", color: "#737373", margin: "0 0 16px" }}>Switching wallet will disconnect the current session. Your notes and profile are saved per wallet.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button onClick={handleSwapWallet} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon icon="ph:wallet-bold" style={{ fontSize: "18px", color: "#525252" }} /> Go to wallet selector
          </button>
          <button onClick={() => setShowWalletModal(false)} style={{ padding: "12px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "white", fontSize: "13px", fontWeight: 600, color: "#737373", cursor: "pointer" }}>
            Cancel
          </button>
        </div>
      </Modal>
    </div>
  );
}
