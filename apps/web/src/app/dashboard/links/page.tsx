"use client";
import { Icon } from "@iconify/react";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, avatarUrlFor } from "@/lib/profile";

const TEMPLATES = [
  {
    id: "simple-payment",
    icon: "ph:currency-dollar-bold",
    iconBg: "#F0FDF4",
    iconColor: "#22c55e",
    label: "Simple payment",
    desc: "Accept private tips with one universal link. Zero-knowledge proof, nobody knows who paid.",
    bestFor: "Content creators, streamers, open source developers",
    active: true,
  },
  {
    id: "digital-product",
    icon: "ph:package-bold",
    iconBg: "#F5F3FF",
    iconColor: "#7c3aed",
    label: "Digital product",
    desc: "Sell AI prompts, Notion templates, Figma presets, and more.",
    bestFor: "Prompt engineers, designers, educators",
    active: false,
  },
  {
    id: "monthly-support",
    icon: "ph:arrows-clockwise-bold",
    iconBg: "#EFF6FF",
    iconColor: "#2563eb",
    label: "Monthly support",
    desc: "Let supporters back you every month. Private, recurring tips.",
    bestFor: "Newsletters, podcasters, indie developers",
    active: false,
  },
  {
    id: "commission",
    icon: "ph:briefcase-bold",
    iconBg: "#FFFBEB",
    iconColor: "#d97706",
    label: "Commission request",
    desc: "Set a price for custom work. Client pays privately, you deliver.",
    bestFor: "Freelancers, illustrators, developers",
    active: false,
  },
  {
    id: "fundraiser",
    icon: "ph:target-bold",
    iconBg: "#FEF2F2",
    iconColor: "#dc2626",
    label: "Fundraiser",
    desc: "Set a goal, show progress. Community supports anonymously.",
    bestFor: "Community projects, open source, indie games",
    active: false,
  },
];

export default function LinksPage() {
  const [address, setAddress] = useState("");
  const [profile, setProfile] = useState<{ displayName: string; avatarVariant: string } | null>(null);
  const [tipLink, setTipLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    const addr = localStorage.getItem("growthip:wallet") ?? "";
    setAddress(addr);
    if (addr) {
      const p = getProfile(addr);
      setProfile({ displayName: p.displayName || "Creator", avatarVariant: p.avatarVariant || "A" });
      try { setTipLink(`https://growthip.vercel.app/tip/${encodeTipId(addr)}`); } catch {}
    }
  }, []);

  function openModal() {
    setShowModal(true);
    setTimeout(() => setModalVisible(true), 10);
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setShowModal(false), 300);
  }

  function copyLink() {
    if (!tipLink) return;
    navigator.clipboard.writeText(tipLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const username = profile?.displayName || address.slice(0, 6) + "..." + address.slice(-4);
  const avatarUrl = address && profile ? avatarUrlFor(address, profile.avatarVariant) : "";

  return (
    <div style={{ padding: "32px", maxWidth: "760px" }}>
      <style>{`
        @keyframes modalBounce {
          0% { transform: scale(0.85) translateY(20px); opacity: 0; }
          60% { transform: scale(1.03) translateY(-4px); opacity: 1; }
          80% { transform: scale(0.98) translateY(2px); }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .modal-backdrop { animation: fadeIn 0.2s ease; }
        .modal-box { animation: modalBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .link-btn:hover { background: #F5F5F5 !important; }
        .template-row:hover { background: #F9FAFB !important; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 4px" }}>Your Links</h1>
          <p style={{ fontSize: "14px", color: "#737373", margin: 0 }}>Manage your payment links</p>
        </div>
        <button
          onClick={openModal}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px", borderRadius: "12px", background: "#F59E0B", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}
        >
          <Icon icon="ph:plus-bold" style={{ fontSize: "16px" }} />
          Create New Link
        </button>
      </div>

      {/* Active link card */}
      <div style={{ background: "white", border: "1px solid #E5E5E5", borderRadius: "16px", padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:currency-dollar-bold" style={{ fontSize: "20px", color: "#22c55e" }} />
            </div>
            <div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 2px" }}>Simple Payment</p>
              <p style={{ fontSize: "12px", color: "#737373", margin: 0 }}>Your active tip link</p>
            </div>
          </div>
          <span style={{ fontSize: "12px", fontWeight: 700, padding: "4px 12px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>Active</span>
        </div>

        {/* Link preview */}
        <div style={{ background: "#F9FAFB", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          {avatarUrl && <img src={avatarUrl} alt="avatar" style={{ width: "40px", height: "40px", borderRadius: "50%", objectFit: "cover" }} />}
          <div>
            <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A", margin: "0 0 2px" }}>@{username}</p>
            <p style={{ fontSize: "12px", color: "#737373", margin: 0 }}>{tipLink || "Connect wallet to see your link"}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
          <button onClick={copyLink} className="link-btn" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #E5E5E5", background: copied ? "#F0FDF4" : "#F9FAFB", fontSize: "13px", fontWeight: 600, color: copied ? "#22c55e" : "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", transition: "all 0.2s" }}>
            <Icon icon={copied ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "16px" }} />
            {copied ? "Copied!" : "Copy"}
          </button>
          <button onClick={() => { if (navigator.share && tipLink) navigator.share({ url: tipLink, title: "Support me on Growthip" }); }} className="link-btn" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <Icon icon="ph:share-network-bold" style={{ fontSize: "16px" }} /> Share
          </button>
          <button onClick={() => setShowQR(!showQR)} className="link-btn" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #E5E5E5", background: showQR ? "#F0F0FF" : "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <Icon icon="ph:qr-code-bold" style={{ fontSize: "16px" }} /> QR
          </button>
          <a href={tipLink || "#"} target="_blank" rel="noreferrer" className="link-btn" style={{ padding: "10px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "13px", fontWeight: 600, color: "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", textDecoration: "none" }}>
            <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "16px" }} /> View
          </a>
        </div>

        {/* QR code */}
        {showQR && tipLink && (
          <div style={{ marginTop: "16px", display: "flex", justifyContent: "center", padding: "16px", background: "white", borderRadius: "12px", border: "1px solid #E5E5E5" }}>
            <QRCodeSVG value={tipLink} size={160} />
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="modal-backdrop"
          onClick={closeModal}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
        >
          <div
            className={modalVisible ? "modal-box" : ""}
            onClick={(e) => e.stopPropagation()}
            style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", padding: "24px", maxHeight: "80vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 2px" }}>Choose a Template</p>
                <p style={{ fontSize: "13px", color: "#737373", margin: 0 }}>Select the perfect link type for your needs</p>
              </div>
              <button onClick={closeModal} style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #E5E5E5", background: "#F5F5F5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="ph:x-bold" style={{ fontSize: "16px", color: "#737373" }} />
              </button>
            </div>

            <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Popular</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {TEMPLATES.map((t) => (
                <div
                  key={t.id}
                  className={t.active ? "template-row" : ""}
                  onClick={() => { if (t.active) closeModal(); }}
                  style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px", borderRadius: "12px", border: t.active ? "1.5px solid #22c55e" : "1px solid #E5E5E5", background: "white", cursor: t.active ? "pointer" : "default", opacity: t.active ? 1 : 0.6, transition: "background 0.15s" }}
                >
                  <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: t.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon icon={t.icon} style={{ fontSize: "20px", color: t.iconColor }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>{t.label}</p>
                      {t.active
                        ? <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>Active</span>
                        : <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#A3A3A3" }}>Coming soon</span>
                      }
                    </div>
                    <p style={{ fontSize: "12px", color: "#525252", margin: "0 0 4px", lineHeight: 1.5 }}>{t.desc}</p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3", margin: 0 }}>Best for: {t.bestFor}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
