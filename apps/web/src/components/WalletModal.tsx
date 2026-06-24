"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import Image from "next/image";

interface WalletModalProps {
  onClose: () => void;
  onSelectWallet: (walletId: string) => Promise<void>;
  connecting?: boolean;
}

const WALLETS = [
  {
    id: "freighter",
    name: "Freighter",
    description: "Browser extension for Stellar",
    icon: "/icons/freighter.png",
    installUrl: "https://www.freighter.app",
  },
  {
    id: "xbull",
    name: "xBull Wallet",
    description: "Secure wallet & multi-platform",
    icon: "/icons/xbull.png",
    installUrl: "https://xbull.app",
  },
];

export default function WalletModal({ onClose, onSelectWallet, connecting }: WalletModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSelect(wallet: typeof WALLETS[0]) {
    setError("");
    setLoadingId(wallet.id);
    try {
      await onSelectWallet(wallet.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed. Make sure the wallet is installed.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "460px", padding: "24px", boxShadow: "0 24px 64px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: 36, height: 36, borderRadius: "10px", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:wallet-bold" style={{ fontSize: "18px", color: "#0A0A0A" }} />
            </div>
            <div>
              <p style={{ fontSize: "15px", fontWeight: 800, color: "#0A0A0A" }}>Connect Wallet</p>
              <p style={{ fontSize: "12px", color: "#737373" }}>Choose a wallet to connect</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #E5E5E5", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#525252" }} />
          </button>
        </div>

        {/* Wallet options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {WALLETS.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => handleSelect(wallet)}
              disabled={loadingId !== null}
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "14px", border: "1px solid #E5E5E5", background: loadingId === wallet.id ? "#F5F5F5" : "white", cursor: loadingId !== null ? "not-allowed" : "pointer", transition: "all 0.15s", textAlign: "left", width: "100%" }}
              onMouseEnter={(e) => { if (!loadingId) (e.currentTarget as HTMLButtonElement).style.background = "#F5F5F5"; }}
              onMouseLeave={(e) => { if (loadingId !== wallet.id) (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
            >
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                <Image src={wallet.icon} alt={wallet.name} width={36} height={36} style={{ objectFit: "cover", borderRadius: "50%", width: "100%", height: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{wallet.name}</p>
                <p style={{ fontSize: "12px", color: "#737373" }}>{wallet.description}</p>
              </div>
              {loadingId === wallet.id ? (
                <Icon icon="ph:spinner-bold" style={{ fontSize: "18px", color: "#A3A3A3", animation: "spin 1s linear infinite" }} />
              ) : (
                <Icon icon="ph:arrow-right-bold" style={{ fontSize: "16px", color: "#A3A3A3" }} />
              )}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <p style={{ fontSize: "12px", color: "#B91C1C" }}>{error}</p>
          </div>
        )}

        {/* Footer */}
        <div style={{ paddingTop: "8px", borderTop: "1px solid #F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <p style={{ fontSize: "12px", color: "#A3A3A3" }}>
            Don&apos;t have a wallet?{" "}
            <a href="https://www.freighter.app" target="_blank" rel="noreferrer" style={{ color: "#0A0A0A", fontWeight: 700, textDecoration: "none" }}>
              Get Freighter →
            </a>
          </p>
          <p style={{ fontSize: "12px", color: "#A3A3A3" }}>
            Or try{" "}
            <a href="https://xbull.app" target="_blank" rel="noreferrer" style={{ color: "#0A0A0A", fontWeight: 700, textDecoration: "none" }}>
              xBull →
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
