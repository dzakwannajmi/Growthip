"use client";
import { Icon } from "@iconify/react";
import Link from "next/link";

const TEMPLATES = [
  {
    id: "simple-payment",
    icon: "ph:currency-dollar-bold",
    iconBg: "#F0FDF4",
    iconColor: "#22c55e",
    label: "Simple payment",
    badge: "Active",
    badgeBg: "#F0FDF4",
    badgeColor: "#22c55e",
    desc: "Accept private tips with one universal link. Zero-knowledge proof, nobody knows who paid.",
    bestFor: "Content creators, streamers, open source developers",
    active: true,
    href: "/dashboard",
  },
  {
    id: "digital-product",
    icon: "ph:package-bold",
    iconBg: "#F5F3FF",
    iconColor: "#7c3aed",
    label: "Digital product",
    badge: "Coming soon",
    badgeBg: "#F5F5F5",
    badgeColor: "#737373",
    desc: "Sell AI prompts, Notion templates, Figma presets, and more. Buyer gets access link after private payment.",
    bestFor: "Prompt engineers, designers, educators",
    active: false,
  },
  {
    id: "monthly-support",
    icon: "ph:arrows-clockwise-bold",
    iconBg: "#EFF6FF",
    iconColor: "#2563eb",
    label: "Monthly support",
    badge: "Coming soon",
    badgeBg: "#F5F5F5",
    badgeColor: "#737373",
    desc: "Let supporters back you every month. Private, recurring tips with USDC or IDRX.",
    bestFor: "Newsletters, podcasters, indie developers",
    active: false,
  },
  {
    id: "commission",
    icon: "ph:briefcase-bold",
    iconBg: "#FFFBEB",
    iconColor: "#d97706",
    label: "Commission request",
    badge: "Coming soon",
    badgeBg: "#F5F5F5",
    badgeColor: "#737373",
    desc: "Set a price for custom work — art, code, writing. Client pays privately, you deliver.",
    bestFor: "Freelancers, illustrators, developers",
    active: false,
  },
  {
    id: "fundraiser",
    icon: "ph:target-bold",
    iconBg: "#FEF2F2",
    iconColor: "#dc2626",
    label: "Fundraiser",
    badge: "Coming soon",
    badgeBg: "#F5F5F5",
    badgeColor: "#737373",
    desc: "Set a goal, show progress. Community supports your project anonymously.",
    bestFor: "Community projects, open source, indie games",
    active: false,
  },
];

export default function LinksPage() {
  const active = TEMPLATES.filter((t) => t.active);
  const coming = TEMPLATES.filter((t) => !t.active);

  return (
    <div style={{ padding: "32px", maxWidth: "680px" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A", margin: "0 0 4px" }}>Your links</h1>
        <p style={{ fontSize: "14px", color: "#737373", margin: 0 }}>Choose how supporters can pay you. More templates coming soon.</p>
      </div>

      <div style={{ marginBottom: "24px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>Active</p>
        {active.map((t) => (
          <Link
            key={t.id}
            href={t.href ?? "#"}
            style={{ display: "flex", alignItems: "flex-start", gap: "14px", background: "white", border: "1px solid #6366f1", borderRadius: "12px", padding: "16px 20px", textDecoration: "none" }}
          >
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: t.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon icon={t.icon} style={{ fontSize: "22px", color: t.iconColor }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <p style={{ fontSize: "15px", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>{t.label}</p>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: t.badgeBg, color: t.badgeColor }}>{t.badge}</span>
              </div>
              <p style={{ fontSize: "13px", color: "#525252", margin: "0 0 6px", lineHeight: 1.5 }}>{t.desc}</p>
              <p style={{ fontSize: "12px", color: "#A3A3A3", margin: 0 }}>Best for: {t.bestFor}</p>
            </div>
            <Icon icon="ph:caret-right-bold" style={{ fontSize: "16px", color: "#A3A3A3", flexShrink: 0, marginTop: "2px" }} />
          </Link>
        ))}
      </div>

      <div>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>More options</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {coming.map((t) => (
            <div
              key={t.id}
              style={{ display: "flex", alignItems: "flex-start", gap: "14px", background: "white", border: "1px solid #E5E5E5", borderRadius: "12px", padding: "16px 20px", opacity: 0.65, cursor: "default" }}
            >
              <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: t.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon icon={t.icon} style={{ fontSize: "22px", color: t.iconColor }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <p style={{ fontSize: "15px", fontWeight: 700, color: "#0A0A0A", margin: 0 }}>{t.label}</p>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: t.badgeBg, color: t.badgeColor }}>{t.badge}</span>
                </div>
                <p style={{ fontSize: "13px", color: "#525252", margin: "0 0 6px", lineHeight: 1.5 }}>{t.desc}</p>
                <p style={{ fontSize: "12px", color: "#A3A3A3", margin: 0 }}>Best for: {t.bestFor}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
