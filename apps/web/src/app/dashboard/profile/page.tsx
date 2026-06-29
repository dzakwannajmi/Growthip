"use client";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, saveProfile, avatarUrlFor, AVATAR_VARIANTS } from "@/lib/profile";

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
  const [tipLink, setTipLink] = useState("");

  useEffect(() => {
    async function load() {
      try {
        if (!(await isConnected()).isConnected) return;
        const addr = (await requestAccess()).address;
        if (!addr) return;
        setAddress(addr);
        const profile = getProfile(addr);
        setDisplayName(profile.displayName);
        setBio(profile.bio);
        setAvatarVariant(profile.avatarVariant);
        try { setTipLink(`https://growthip.vercel.app/tip/${encodeTipId(addr)}`); } catch {}
      } catch {}
    }
    load();
  }, []);

  function handleSaveProfile() {
    setSavedFlash(true);
    saveProfile(address, { displayName: displayName.trim(), bio: bio.trim(), avatarVariant });
    setEditingProfile(false);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function copyAddress() {
    navigator.clipboard.writeText(address);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  }

  function copyTipLink() {
    navigator.clipboard.writeText(tipLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  return (
    <div className="flex flex-col gap-5 p-6 max-w-lg mx-auto">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: "#0A0A0A" }}>Profile</h1>
        <p className="text-sm" style={{ color: "#525252" }}>Manage your public creator profile</p>
      </div>

      {!address ? (
        <div className="rounded-2xl p-6 text-center" style={{ border: "1px solid #E5E5E5", background: "white" }}>
          <p style={{ fontSize: "13px", color: "#737373" }}>Connect your wallet to see your profile.</p>
        </div>
      ) : (
        <>
          {/* Profile header */}
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
                            style={{ width: "40px", height: "40px", padding: "2px", borderRadius: "8px", border: avatarVariant === v ? "2px solid #0A0A0A" : "1px solid #E5E5E5", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                          >
                            <img src={avatarUrlFor(address, v)} alt={v || "default"} width={36} height={36} style={{ width: 36, height: 36, borderRadius: "6px" }} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveProfile} style={{ padding: "6px 14px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer" }}>Save</button>
                      <button onClick={() => setEditingProfile(false)} style={{ padding: "6px 14px", borderRadius: "999px", background: "transparent", color: "#737373", fontSize: "12px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="font-bold text-lg truncate" style={{ color: "#0A0A0A" }}>{displayName || "Unnamed Creator"}</div>
                      <button onClick={() => setEditingProfile(true)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", color: "#A3A3A3" }} aria-label="Edit profile">
                        <Icon icon="ph:pencil-simple-bold" style={{ fontSize: "14px" }} />
                      </button>
                    </div>
                    {bio && <p className="text-sm mt-1" style={{ color: "#525252" }}>{bio}</p>}
                    {savedFlash && <p className="text-xs mt-1" style={{ color: "#22C55E" }}>Saved</p>}
                  </>
                )}
                <button onClick={copyAddress} title={address} className="text-xs flex items-center gap-1 mt-2" style={{ color: "#737373", background: "none", border: "none", cursor: "pointer", fontFamily: "monospace", padding: 0 }}>
                  <Icon icon={copiedAddress ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ color: copiedAddress ? "#22C55E" : "#A3A3A3" }} />
                  {address.slice(0, 6)}...{address.slice(-6)}
                </button>
              </div>
            </div>
          </div>

          {/* Tip link card */}
          <div className="rounded-2xl p-5" style={{ border: "1px solid #E5E5E5", background: "white" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#737373" }}>Your Tip Link</p>
            <div className="flex items-center gap-2 mb-3" style={{ padding: "10px 12px", borderRadius: "10px", background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
              <Icon icon="ph:link" style={{ color: "#737373", flexShrink: 0 }} />
              <span className="text-sm truncate" style={{ color: "#0A0A0A", fontFamily: "monospace" }}>{tipLink.replace("https://", "")}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={copyTipLink} className="flex-1 flex items-center justify-center gap-2" style={{ padding: "10px", borderRadius: "10px", background: copiedLink ? "#22C55E" : "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer" }}>
                <Icon icon={copiedLink ? "ph:check-bold" : "ph:copy-simple-bold"} />
                {copiedLink ? "Copied!" : "Copy Link"}
              </button>
              <button onClick={() => setShowQR((p) => !p)} className="flex items-center justify-center gap-2" style={{ padding: "10px 16px", borderRadius: "10px", background: "white", color: "#0A0A0A", fontSize: "13px", fontWeight: 700, border: "1px solid #E5E5E5", cursor: "pointer" }}>
                <Icon icon="ph:qr-code-bold" /> QR
              </button>
            </div>
            {showQR && (
              <div className="flex flex-col items-center gap-2 mt-3" style={{ padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                <div style={{ background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #E5E5E5" }}>
                  <QRCodeSVG value={tipLink} size={160} level="M" />
                </div>
                <p className="text-xs text-center" style={{ color: "#737373" }}>Share this on stream, in your bio, or print it.</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
