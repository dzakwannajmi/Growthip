"use client";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, avatarUrlFor } from "@/lib/profile";

const TEMPLATES = [
  { id: "simple-payment", icon: "ph:currency-dollar-bold", iconBg: "#F0FDF4", iconColor: "#22c55e", label: "Simple payment", desc: "Accept private tips with one universal link. Zero-knowledge proof, nobody knows who paid.", bestFor: "Content creators, streamers, open source developers", active: true },
  { id: "digital-product", icon: "ph:package-bold", iconBg: "#F5F3FF", iconColor: "#7c3aed", label: "Digital product", desc: "Sell AI prompts, Notion templates, Figma presets, and more.", bestFor: "Prompt engineers, designers, educators", active: false },
  { id: "monthly-support", icon: "ph:arrows-clockwise-bold", iconBg: "#EFF6FF", iconColor: "#2563eb", label: "Monthly support", desc: "Let supporters back you every month. Private, recurring tips.", bestFor: "Newsletters, podcasters, indie developers", active: false },
  { id: "commission", icon: "ph:briefcase-bold", iconBg: "#FFFBEB", iconColor: "#d97706", label: "Commission request", desc: "Set a price for custom work. Client pays privately, you deliver.", bestFor: "Freelancers, illustrators, developers", active: false },
  { id: "fundraiser", icon: "ph:target-bold", iconBg: "#FEF2F2", iconColor: "#dc2626", label: "Fundraiser", desc: "Set a goal, show progress. Community supports anonymously.", bestFor: "Community projects, open source, indie games", active: false },
];

const SHARE_PLATFORMS = [
  { id: "x", label: "X (Twitter)", icon: "ri:twitter-x-fill", available: true, color: "#000000", buildUrl: (link: string, msg: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg + "\n" + link)}` },
  { id: "discord", label: "Discord", icon: "ri:discord-fill", available: false, color: "#5865F2" },
  { id: "twitch", label: "Twitch", icon: "ri:twitch-fill", available: false, color: "#9146FF" },
];

function Modal({ show, onClose, children }: { show: boolean; onClose: () => void; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (show) setTimeout(() => setVisible(true), 10);
    else setVisible(false);
  }, [show]);
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", padding: "24px", maxHeight: "85vh", overflowY: "auto", transform: visible ? "scale(1) translateY(0)" : "scale(0.85) translateY(20px)", opacity: visible ? 1 : 0, transition: "all 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
        {children}
      </div>
    </div>
  );
}

export default function LinksPage() {
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("Creator");
  const [avatarVariant, setAvatarVariant] = useState("A");
  const [tipLink, setTipLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  useEffect(() => {
    const addr = localStorage.getItem("growthip:wallet") ?? "";
    setAddress(addr);
    if (addr) {
      const p = getProfile(addr);
      setDisplayName(p.displayName || "Creator");
      try {
        const link = `https://growthip.vercel.app/tip/${encodeTipId(addr)}`;
        setTipLink(link);
        setShareMsg(`Support me privately on Growthip — zero-knowledge tips, nobody knows who paid 🌱`);
      } catch {}
    }
  }, []);

  function copyLink() {
    if (!tipLink) return;
    navigator.clipboard.writeText(tipLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const avatarUrl = address ? avatarUrlFor(address) : "";
  const username = displayName || address.slice(0, 6) + "..." + address.slice(-4);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .btn-hover:hover { background: #F5F5F5 !important; }
        .platform-btn:hover { border-color: #0A0A0A !important; }
      `}</style>

      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 2px" }}>Your Links</h1>
            <p style={{ fontSize: "13px", color: "#737373", margin: 0 }}>Manage your payment links</p>
          </div>
          <button onClick={() => setShowTemplates(true)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            <Icon icon="ph:plus-bold" style={{ fontSize: "15px" }} /> Create New Link
          </button>
        </div>

        {/* Active card */}
        <div style={{ background: "white", border: "1px solid #E5E5E5", borderRadius: "20px", padding: "20px" }}>
          {/* Card header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="ph:currency-dollar-bold" style={{ fontSize: "18px", color: "#22c55e" }} />
              </div>
              <div>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 1px" }}>Simple Payment</p>
                <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>Your active tip link</p>
              </div>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>Active</span>
          </div>

          {/* Profile preview */}
          <div style={{ background: "#F9FAFB", borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }} />
              : <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#E5E5E5", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon icon="ph:user-bold" style={{ fontSize: "18px", color: "#A3A3A3" }} /></div>
            }
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 2px" }}>@{username}</p>
              <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink || "Connect wallet to see your link"}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {[
              { icon: copied ? "ph:check-bold" : "ph:copy-simple-bold", label: copied ? "Copied!" : "Copy", color: copied ? "#22c55e" : "#0A0A0A", bg: copied ? "#F0FDF4" : "#F9FAFB", onClick: copyLink },
              { icon: "ph:share-network-bold", label: "Share", color: "#0A0A0A", bg: "#F9FAFB", onClick: () => setShowShare(true) },
              { icon: "ph:qr-code-bold", label: "QR", color: "#0A0A0A", bg: "#F9FAFB", onClick: () => setShowQR(true) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.onClick} className="btn-hover" style={{ padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: btn.bg, fontSize: "12px", fontWeight: 600, color: btn.color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", transition: "all 0.15s" }}>
                <Icon icon={btn.icon} style={{ fontSize: "15px" }} /> {btn.label}
              </button>
            ))}
            <a href={tipLink || "#"} target="_blank" rel="noreferrer" className="btn-hover" style={{ padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "12px", fontWeight: 600, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", textDecoration: "none" }}>
              <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "15px" }} /> View
            </a>
          </div>
        </div>
      </div>

      {/* QR Modal */}
      <Modal show={showQR} onClose={() => setShowQR(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ flex: 1 }} />
          <p style={{ fontSize: "17px", fontWeight: 800, color: "#0A0A0A", margin: 0, textAlign: "center", flex: 2 }}>Personal</p>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowQR(false)} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#737373" }} />
            </button>
          </div>
        </div>
        <p style={{ fontSize: "13px", color: "#A3A3A3", margin: "0 0 20px", textAlign: "center" }}>Scan to open payment link</p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          {/* QR with green border */}
          <div style={{ padding: "14px", background: "#22c55e", borderRadius: "20px", display: "inline-flex" }}>
            <div style={{ padding: "12px", background: "white", borderRadius: "12px" }}>
              {tipLink && <QRCodeSVG value={tipLink} size={200} />}
            </div>
          </div>
          {/* URL box */}
          <div style={{ width: "100%", padding: "12px 14px", background: "#F9FAFB", borderRadius: "12px", border: "1px solid #E5E5E5" }}>
            <p style={{ fontSize: "12px", color: "#525252", margin: 0, textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink}</p>
          </div>
          {/* Download button */}
          <button
            onClick={() => {
              if (!tipLink) return;
              const canvas = document.querySelector("canvas");
              if (canvas) {
                const url = canvas.toDataURL("image/png");
                const a = document.createElement("a");
                a.href = url;
                a.download = "growthip-qr.png";
                a.click();
              }
            }}
            style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <Icon icon="ph:download-simple-bold" style={{ fontSize: "16px" }} /> Download QR Code
          </button>
          {/* Growthip branding */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <img src="/growthip-logo.png" alt="Growthip" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>Growthip</span>
          </div>
        </div>
      </Modal>

      {/* Share Modal */}
      <Modal show={showShare} onClose={() => setShowShare(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p style={{ fontSize: "16px", fontWeight: 800, color: "#0A0A0A", margin: 0 }}>Share your link</p>
          <button onClick={() => setShowShare(false)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#737373" }} />
          </button>
        </div>

        {/* Custom message */}
        <div style={{ marginBottom: "16px" }}>
          <p style={{ fontSize: "12px", fontWeight: 600, color: "#525252", margin: "0 0 8px" }}>Custom message</p>
          <textarea
            value={shareMsg}
            onChange={(e) => setShareMsg(e.target.value)}
            rows={3}
            placeholder="Write a message to share with your link..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #E5E5E5", fontSize: "13px", resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.5, color: "#0A0A0A" }}
          />
          <p style={{ fontSize: "11px", color: "#A3A3A3", margin: "4px 0 0" }}>{shareMsg.length}/280 characters</p>
        </div>

        {/* Platforms */}
        <p style={{ fontSize: "12px", fontWeight: 600, color: "#525252", margin: "0 0 10px" }}>Share to</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {SHARE_PLATFORMS.map((p) => (
            <button
              key={p.id}
              className="platform-btn"
              disabled={!p.available}
              onClick={() => {
                if (!p.available || !p.buildUrl) return;
                window.open(p.buildUrl(tipLink, shareMsg), "_blank");
              }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "white", cursor: p.available ? "pointer" : "default", opacity: p.available ? 1 : 0.5, transition: "border-color 0.15s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Icon icon={p.icon} style={{ fontSize: "20px", color: p.available ? p.color : "#A3A3A3" }} />
                <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A" }}>{p.label}</span>
              </div>
              {p.available
                ? <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>Available</span>
                : <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#A3A3A3" }}>Coming soon</span>
              }
            </button>
          ))}
        </div>

        {/* Copy fallback */}
        <button
          onClick={() => { navigator.clipboard.writeText(shareMsg + "\n" + tipLink); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          style={{ marginTop: "12px", width: "100%", padding: "11px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <Icon icon={copied ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "15px", color: copied ? "#22c55e" : "#0A0A0A" }} />
          {copied ? "Copied to clipboard!" : "Copy message + link"}
        </button>
      </Modal>

      {/* Template Modal */}
      <Modal show={showTemplates} onClose={() => setShowTemplates(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <p style={{ fontSize: "16px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 2px" }}>Choose a Template</p>
            <p style={{ fontSize: "12px", color: "#737373", margin: 0 }}>Select the perfect link type for your needs</p>
          </div>
          <button onClick={() => setShowTemplates(false)} style={{ width: "30px", height: "30px", borderRadius: "8px", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#737373" }} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              onClick={() => { if (t.active) setShowTemplates(false); }}
              style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px", borderRadius: "12px", border: t.active ? "1.5px solid #22c55e" : "1px solid #E5E5E5", background: "white", cursor: t.active ? "pointer" : "default", opacity: t.active ? 1 : 0.55 }}
            >
              <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: t.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon icon={t.icon} style={{ fontSize: "18px", color: t.iconColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                  <p style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>{t.label}</p>
                  <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", background: t.active ? "#F0FDF4" : "#F5F5F5", color: t.active ? "#22c55e" : "#A3A3A3" }}>{t.active ? "Active" : "Coming soon"}</span>
                </div>
                <p style={{ fontSize: "12px", color: "#525252", margin: "0 0 3px", lineHeight: 1.5 }}>{t.desc}</p>
                <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>Best for: {t.bestFor}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
