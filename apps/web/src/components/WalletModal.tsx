"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

interface Wallet {
  id:          string;
  name:        string;
  description: string;
  available:   boolean;
  getUrl?:     string;
}

const WALLETS: Wallet[] = [
  {
    id:          "freighter",
    name:        "Freighter",
    description: "Browser extension for Stellar",
    available:   true,
    getUrl:      "https://www.freighter.app",
  },
  {
    id:          "xbull",
    name:        "xBull Wallet",
    description: "Secure wallet & multi-platform",
    available:   false,
  },
  {
    id:          "albedo",
    name:        "Albedo",
    description: "Web-based wallet and signer",
    available:   false,
  },
];

interface WalletModalProps {
  onClose:           () => void;
  onSelectFreighter: () => void;
  connecting:        boolean;
}

export default function WalletModal({ onClose, onSelectFreighter, connecting }: WalletModalProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 300,
        background: "rgba(0,0,0,0.3)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "24px",
      }}
    >
      <div style={{
        background: "white", borderRadius: "20px", width: "100%", maxWidth: "400px",
        overflow: "hidden", boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
        border: "1px solid #E5E5E5",
      }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: 44, height: 44, borderRadius: "12px", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:wallet-bold" style={{ fontSize: "22px", color: "#0A0A0A" }} />
            </div>
            <div>
              <p style={{ fontSize: "16px", fontWeight: 800, color: "#0A0A0A" }}>Connect Wallet</p>
              <p style={{ fontSize: "13px", color: "#A3A3A3", marginTop: "2px" }}>Choose a wallet to connect</p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "8px", background: "#F5F5F5", border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#525252" }} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: "1px", background: "#F5F5F5" }} />

        {/* Wallet list */}
        <div style={{ padding: "12px" }}>
          {WALLETS.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => {
                if (!wallet.available) return;
                if (wallet.id === "freighter") onSelectFreighter();
              }}
              onMouseEnter={() => setHovered(wallet.id)}
              onMouseLeave={() => setHovered(null)}
              disabled={!wallet.available || connecting}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "14px",
                padding: "14px 16px", borderRadius: "14px", border: "1px solid transparent",
                background: hovered === wallet.id && wallet.available ? "#F5F5F5" : "white",
                cursor: wallet.available && !connecting ? "pointer" : "not-allowed",
                transition: "all 0.15s", marginBottom: "4px",
                opacity: wallet.available ? 1 : 0.4,
              }}
            >
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: "12px",
                background: wallet.available ? "#F5F5F5" : "#FAFAFA",
                border: "1px solid #E5E5E5",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: "18px", fontWeight: 900, color: wallet.available ? "#0A0A0A" : "#A3A3A3", fontFamily: "monospace" }}>
                  {wallet.name[0]}
                </span>
              </div>

              {/* Info */}
              <div style={{ flex: 1, textAlign: "left" }}>
                <p style={{ fontSize: "15px", fontWeight: 700, color: wallet.available ? "#0A0A0A" : "#A3A3A3" }}>
                  {wallet.name}
                  {connecting && wallet.id === "freighter" && (
                    <span style={{ marginLeft: "8px", fontSize: "12px", color: "#A3A3A3", fontWeight: 500 }}>
                      Connecting...
                    </span>
                  )}
                </p>
                <p style={{ fontSize: "12px", color: "#A3A3A3", marginTop: "2px" }}>{wallet.description}</p>
              </div>

              {/* Coming soon badge */}
              {!wallet.available && (
                <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "999px", background: "#F5F5F5", border: "1px solid #E5E5E5", color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div style={{ height: "1px", background: "#F5F5F5" }} />
        <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
          <span style={{ fontSize: "13px", color: "#A3A3A3" }}>{"Don't have a wallet?"}</span>
          <a
            href="https://www.freighter.app"
            target="_blank"
            rel="noreferrer noopener"
            style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A", textDecoration: "none" }}>
            Get Freighter →
          </a>
        </div>
    </div>
    <div>
  );
