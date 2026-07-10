"use client";
import { Icon } from "@iconify/react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import Modal from "@/components/Modal";
import { encodeTipId } from "@/lib/addressId";
import { getProfile, avatarUrlFor } from "@/lib/profile";
import { getToken, getAvailableTokens, toBaseUnits, fromBaseUnits, type TokenSymbol } from "@/lib/tokens";
import {
  generateCampaignId,
  buildCampaignPath,
  saveCampaign,
  loadCampaigns,
  deleteCampaign,
  type CampaignMetadata,
} from "@/lib/campaign";

const TEMPLATES = [
  { id: "simple-payment", icon: "ph:currency-dollar-bold", iconBg: "#F0FDF4", iconColor: "#22c55e", label: "Simple payment", desc: "Accept private tips with one universal link. Zero-knowledge proof, nobody knows who paid.", bestFor: "Content creators, streamers, open source developers", active: true },
  { id: "digital-product", icon: "ph:package-bold", iconBg: "#F5F3FF", iconColor: "#7c3aed", label: "Digital product", desc: "Sell AI prompts, Notion templates, Figma presets, and more.", bestFor: "Prompt engineers, designers, educators", active: false },
  { id: "monthly-support", icon: "ph:arrows-clockwise-bold", iconBg: "#EFF6FF", iconColor: "#2563eb", label: "Monthly support", desc: "Let supporters back you every month. Private, recurring tips.", bestFor: "Newsletters, podcasters, indie developers", active: false },
  { id: "commission", icon: "ph:briefcase-bold", iconBg: "#FFFBEB", iconColor: "#d97706", label: "Commission request", desc: "Set a price for custom work. Client pays privately, you deliver.", bestFor: "Freelancers, illustrators, developers", active: false },
  { id: "fundraiser", icon: "ph:target-bold", iconBg: "#FEF2F2", iconColor: "#dc2626", label: "Fundraiser", desc: "Set a goal, show progress. Supporters back it without being linked to their contribution.", bestFor: "Community projects, open source, indie games", active: true },
];

const SHARE_PLATFORMS = [
  { id: "x", label: "X (Twitter)", icon: "ri:twitter-x-fill", available: true, color: "#000000", buildUrl: (link: string, msg: string) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(msg + "\n" + link)}` },
  { id: "discord", label: "Discord", icon: "ri:discord-fill", available: false, color: "#5865F2" },
  { id: "twitch", label: "Twitch", icon: "ri:twitch-fill", available: false, color: "#9146FF" },
];

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

  // Fundraiser campaign creation + listing state
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [campaignDeadline, setCampaignDeadline] = useState("");
  const [campaignToken, setCampaignToken] = useState("XLM");
  const [campaigns, setCampaigns] = useState<CampaignMetadata[]>([]);
  const [copiedCampaignId, setCopiedCampaignId] = useState<string | null>(null);

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
      setCampaigns(loadCampaigns(addr));
    }
  }, []);

  function copyLink() {
    if (!tipLink) return;
    navigator.clipboard.writeText(tipLink);
    toast.success("Tip link copied");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function createCampaign() {
    if (!address) { toast.error("Connect your wallet first"); return; }
    if (!campaignTitle.trim()) { toast.error("Campaign title is required"); return; }
    if (!campaignGoal.trim()) { toast.error("Goal amount is required"); return; }

    const token = getToken(campaignToken as TokenSymbol);
    if (!token) { toast.error("Invalid token selected"); return; }

    const goalAmount = toBaseUnits(Number(campaignGoal), token);
    if (!Number.isFinite(goalAmount) || goalAmount <= 0) { toast.error("Enter a valid goal amount"); return; }

    const deadline = campaignDeadline
      ? Math.floor(new Date(campaignDeadline).getTime() / 1000)
      : null;

    const meta: CampaignMetadata = {
      recipientAddress: address,
      campaignId: generateCampaignId(),
      title: campaignTitle.trim(),
      goalAmount,
      deadline,
      tokenSymbol: campaignToken,
    };

    saveCampaign(meta);
    setCampaigns(loadCampaigns(address));
    setShowCampaignForm(false);
    setCampaignTitle("");
    setCampaignGoal("");
    setCampaignDeadline("");
  }

  function copyCampaignLink(meta: CampaignMetadata) {
    const url = `https://growthip.vercel.app${buildCampaignPath(meta)}`;
    navigator.clipboard.writeText(url);
    toast.success("Campaign link copied");
    setCopiedCampaignId(meta.campaignId);
    setTimeout(() => setCopiedCampaignId(null), 2000);
  }

  function handleDeleteCampaign(campaignId: string) {
    if (!address) return;
    deleteCampaign(address, campaignId);
    setCampaigns(loadCampaigns(address));
  }

  const avatarUrl = address ? avatarUrlFor(address) : "";
  const username = displayName || address.slice(0, 6) + "..." + address.slice(-4);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <style>{`
        .btn-hover:hover { background: #F5F5F5 !important; }
        .platform-btn:hover { border-color: #0A0A0A !important; }
        html.dark .btn-hover:hover { background: #2A2A2A !important; }
        html.dark .platform-btn:hover { border-color: #6A6A6A !important; }
      `}</style>

      <div style={{ width: "100%", maxWidth: "560px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px" }}>
          <div>
            <h1 className="text-[26px] font-extrabold text-[#0A0A0A] dark:text-[#FAFAFA]" style={{ margin: "0 0 2px" }}>Your Links</h1>
            <p className="text-[13px] text-[#737373] dark:text-[#8A8A8A]" style={{ margin: 0 }}>Manage your payment links</p>
          </div>
          <button onClick={() => setShowTemplates(true)} className="bg-[#0A0A0A] text-white" style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 18px", borderRadius: "12px", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            <Icon icon="ph:plus-bold" style={{ fontSize: "15px" }} /> Create New Link
          </button>
        </div>

        {/* Active card */}
        <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ borderRadius: "20px", padding: "20px" }}>
          {/* Card header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#F0FDF4", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="ph:currency-dollar-bold" style={{ fontSize: "18px", color: "#16a34a", WebkitTextFillColor: "#16a34a" }} />
              </div>
              <div>
                <p className="text-[#0A0A0A] dark:text-[#FAFAFA] font-bold text-[14px]" style={{ margin: "0 0 1px" }}>Simple Payment</p>
                <p className="text-[11px] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ margin: 0 }}>Your active tip link</p>
              </div>
            </div>
            <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "#F0FDF4", color: "#16a34a", WebkitTextFillColor: "#16a34a" }}>Active</span>
          </div>

          {/* Profile preview */}
          <div className="bg-[#F9FAFB] dark:bg-[#1A1A1A]" style={{ borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" style={{ width: "38px", height: "38px", borderRadius: "50%", objectFit: "cover" }} />
              : <div className="bg-[#E5E5E5] dark:bg-[#2A2A2A]" style={{ width: "38px", height: "38px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon icon="ph:user-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "18px" }} /></div>
            }
            <div style={{ minWidth: 0 }}>
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 2px" }}>@{username}</p>
              <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink || "Connect wallet to see your link"}</p>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
            {[
              { icon: copied ? "ph:check-bold" : "ph:copy-simple-bold", label: copied ? "Copied!" : "Copy", color: copied ? "#22c55e" : "#0A0A0A", bg: copied ? "#F0FDF4" : "#F9FAFB", onClick: copyLink },
              { icon: "ph:share-network-bold", label: "Share", color: "#0A0A0A", bg: "#F9FAFB", onClick: () => setShowShare(true) },
              { icon: "ph:qr-code-bold", label: "QR", color: "#0A0A0A", bg: "#F9FAFB", onClick: () => setShowQR(true) },
            ].map((btn) => (
              <button key={btn.label} onClick={btn.onClick} className="btn-hover dark:border-[#2A2A2A] dark:!bg-[#1A1A1A] dark:[&>*]:text-[#D4D4D4]" style={{ padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: btn.bg, fontSize: "12px", fontWeight: 600, color: btn.color, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", transition: "all 0.15s" }}>
                <Icon icon={btn.icon} style={{ fontSize: "15px" }} /> {btn.label}
              </button>
            ))}
            <a href={tipLink || "#"} target="_blank" rel="noreferrer" className="btn-hover dark:border-[#2A2A2A] dark:!bg-[#1A1A1A] dark:!text-[#D4D4D4]" style={{ padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "12px", fontWeight: 600, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", textDecoration: "none" }}>
              <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "15px" }} /> View
            </a>
          </div>
        </div>
      </div>

      {/* Fundraiser Campaigns */}
      {campaigns.length > 0 && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <p className="text-[13px] font-bold text-[#0A0A0A] dark:text-[#FAFAFA]" style={{ margin: 0 }}>Your Campaigns</p>
          {campaigns.map((c) => {
            const token = getToken(c.tokenSymbol as TokenSymbol);
            const goalHuman = token ? fromBaseUnits(c.goalAmount, token) : 0;
            return (
              <div key={c.campaignId} className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ borderRadius: "16px", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon icon="ph:target-bold" style={{ fontSize: "16px", color: "#dc2626", WebkitTextFillColor: "#dc2626" }} />
                    </div>
                    <div>
                      <p className="text-[#0A0A0A] dark:text-[#FAFAFA] font-bold text-[13px]" style={{ margin: 0 }}>{c.title}</p>
                      <p className="text-[11px] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ margin: 0 }}>
                        Goal: {goalHuman} {c.tokenSymbol}
                        {c.deadline && ` \u00b7 Ends ${new Date(c.deadline * 1000).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteCampaign(c.campaignId)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px" }}>
                    <Icon icon="ph:trash-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "15px" }} />
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => copyCampaignLink(c)} className="btn-hover dark:border-[#2A2A2A] dark:!bg-[#1A1A1A] dark:[&>*]:text-[#D4D4D4]" style={{ flex: 1, padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: copiedCampaignId === c.campaignId ? "#F0FDF4" : "#F9FAFB", fontSize: "12px", fontWeight: 600, color: copiedCampaignId === c.campaignId ? "#16a34a" : "#0A0A0A", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                    <Icon icon={copiedCampaignId === c.campaignId ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "14px" }} />
                    {copiedCampaignId === c.campaignId ? "Copied!" : "Copy Link"}
                  </button>
                  <a href={buildCampaignPath(c)} target="_blank" rel="noreferrer" className="btn-hover dark:border-[#2A2A2A] dark:!bg-[#1A1A1A] dark:!text-[#D4D4D4]" style={{ flex: 1, padding: "9px 4px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#F9FAFB", fontSize: "12px", fontWeight: 600, color: "#0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", textDecoration: "none" }}>
                    <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} /> View
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Campaign Modal */}
      <Modal show={showCampaignForm} onClose={() => setShowCampaignForm(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Create Fundraiser</p>
          <button onClick={() => setShowCampaignForm(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Campaign title</label>
            <input
              value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              placeholder="Help fund my open-source project"
              maxLength={80}
              className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
              <label className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Goal amount</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={campaignGoal}
                onChange={(e) => setCampaignGoal(e.target.value)}
                placeholder="100"
                className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px" }}
              />
            </div>
            <div style={{ width: "110px" }}>
              <label className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Token</label>
              <select
                value={campaignToken}
                onChange={(e) => setCampaignToken(e.target.value)}
                className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px" }}
              >
                {getAvailableTokens().map((t) => (
                  <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "6px" }}>Deadline (optional)</label>
            <input
              type="date"
              value={campaignDeadline}
              onChange={(e) => setCampaignDeadline(e.target.value)}
              className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px" }}
            />
          </div>
          <button
            onClick={createCampaign}
            disabled={!campaignTitle.trim() || !campaignGoal.trim()}
            className={(!campaignTitle.trim() || !campaignGoal.trim()) ? "bg-[#E5E5E5] dark:bg-[#2A2A2A]" : "bg-[#0A0A0A]"} style={{ width: "100%", padding: "12px", borderRadius: "12px", color: "white", border: "none", fontSize: "14px", fontWeight: 700, cursor: (!campaignTitle.trim() || !campaignGoal.trim()) ? "not-allowed" : "pointer" }}
          >
            Create Campaign
          </button>
        </div>
      </Modal>

      {/* QR Modal */}
      <Modal show={showQR} onClose={() => setShowQR(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div style={{ flex: 1 }} />
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "17px", fontWeight: 800, margin: 0, textAlign: "center", flex: 2 }}>Personal</p>
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => setShowQR(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
            </button>
          </div>
        </div>
        <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "13px", margin: "0 0 20px", textAlign: "center" }}>Scan to open payment link</p>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
          {/* QR with green border */}
          <div style={{ padding: "14px", background: "#22c55e", borderRadius: "20px", display: "inline-flex" }}>
            <div className="bg-white" style={{ padding: "12px", borderRadius: "12px" }}>
              {tipLink && <QRCodeSVG value={tipLink} size={200} />}
            </div>
          </div>
          {/* URL box */}
          <div className="bg-[#F9FAFB] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ width: "100%", padding: "12px 14px", borderRadius: "12px" }}>
            <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", margin: 0, textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink}</p>
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
            className="bg-[#0A0A0A] text-white" style={{ width: "100%", padding: "12px", borderRadius: "12px", border: "none", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <Icon icon="ph:download-simple-bold" style={{ fontSize: "16px" }} /> Download QR Code
          </button>
          {/* Growthip branding */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <img src="/growthip-logo.png" alt="Growthip" style={{ width: "24px", height: "24px", objectFit: "contain" }} />
            <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700 }}>Growthip</span>
          </div>
        </div>
      </Modal>

      {/* Share Modal */}
      <Modal show={showShare} onClose={() => setShowShare(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Share your link</p>
          <button onClick={() => setShowShare(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
          </button>
        </div>

        {/* Custom message */}
        <div style={{ marginBottom: "16px" }}>
          <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>Custom message</p>
          <textarea
            value={shareMsg}
            onChange={(e) => setShareMsg(e.target.value.slice(0, 280))}
            rows={3}
            maxLength={280}
            placeholder="Write a message to share with your link..."
            className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.5 }}
          />
          <p className={shareMsg.length >= 260 ? "" : "dark:text-[#6A6A6A]"} style={{ fontSize: "11px", color: shareMsg.length >= 260 ? "#ef4444" : "#A3A3A3", margin: "4px 0 0" }}>{shareMsg.length}/280 characters</p>
        </div>

        {/* Platforms */}
        <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 10px" }}>Share to</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {SHARE_PLATFORMS.map((p) => (
            <button
              key={p.id}
              className="platform-btn bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]"
              disabled={!p.available}
              onClick={() => {
                if (!p.available || !p.buildUrl) return;
                window.open(p.buildUrl(tipLink, shareMsg), "_blank");
              }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "12px", cursor: p.available ? "pointer" : "default", opacity: p.available ? 1 : 0.5, transition: "border-color 0.15s" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Icon icon={p.icon} style={{ fontSize: "20px", color: p.available ? (p.id === "x" ? "currentColor" : p.color) : "#A3A3A3" }} className={p.id === "x" ? "dark:text-white text-black" : ""} />
                <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 600 }}>{p.label}</span>
              </div>
              {p.available
                ? <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F0FDF4", color: "#16a34a", WebkitTextFillColor: "#16a34a" }}>Available</span>
                : <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>Coming soon</span>
              }
            </button>
          ))}
        </div>

        {/* Copy fallback */}
        <button
          onClick={() => { navigator.clipboard.writeText(shareMsg + "\n" + tipLink); toast.success("Message and link copied"); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ marginTop: "12px", width: "100%", padding: "11px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
        >
          <Icon icon={copied ? "ph:check-bold" : "ph:copy-simple-bold"} className={copied ? "" : "dark:text-[#E5E5E5]"} style={{ fontSize: "15px", color: copied ? "#22c55e" : "#0A0A0A" }} />
          {copied ? "Copied to clipboard!" : "Copy message + link"}
        </button>
      </Modal>

      {/* Template Modal */}
      <Modal show={showTemplates} onClose={() => setShowTemplates(false)}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: "0 0 2px" }}>Choose a Template</p>
            <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px", margin: 0 }}>Select the perfect link type for your needs</p>
          </div>
          <button onClick={() => setShowTemplates(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {TEMPLATES.map((t) => (
            <div
              key={t.id}
              onClick={() => {
                if (!t.active) return;
                setShowTemplates(false);
                if (t.id === "fundraiser") setShowCampaignForm(true);
              }}
              className={["bg-white dark:bg-[#1A1A1A]", t.active ? "border-[1.5px] border-[#22c55e]" : "border border-[#E5E5E5] dark:border-[#2A2A2A]"].join(" ")} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px", borderRadius: "12px", cursor: t.active ? "pointer" : "default", opacity: t.active ? 1 : 0.55 }}
            >
              <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: t.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon icon={t.icon} style={{ fontSize: "18px", color: t.iconColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                  <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700, margin: 0 }}>{t.label}</p>
                  <span className={t.active ? "bg-[#F0FDF4] dark:bg-[#12271A]" : "bg-[#F5F5F5] dark:bg-[#2A2A2A]"} style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "999px", color: t.active ? "#22c55e" : "#A3A3A3" }}>{t.active ? "Active" : "Coming soon"}</span>
                </div>
                <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", margin: "0 0 3px", lineHeight: 1.5 }}>{t.desc}</p>
                <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", margin: 0 }}>Best for: {t.bestFor}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
