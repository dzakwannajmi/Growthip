"use client";

import { useState } from "react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import { Icon } from "@iconify/react";
import Image from "next/image";

interface WalletModalProps {
  show: boolean;
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

export default function WalletModal({ show, onClose, onSelectWallet, connecting }: WalletModalProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSelect(wallet: typeof WALLETS[0]) {
    setError("");
    setLoadingId(wallet.id);
    try {
      await onSelectWallet(wallet.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed. Make sure the wallet is installed.";
      setError(message);
      toast.error("Wallet connection failed", { description: message });
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <Modal show={show} onClose={onClose} maxWidth="460px">
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="bg-[#F5F5F5] dark:bg-[#2A2A2A]" style={{ width: 36, height: 36, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:wallet-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "18px" }} />
            </div>
            <div>
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "15px", fontWeight: 800 }}>Connect Wallet</p>
              <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px" }}>Choose a wallet to connect</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ width: 32, height: 32, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:x-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "14px" }} />
          </button>
        </div>

        {/* Wallet options */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {WALLETS.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => handleSelect(wallet)}
              disabled={loadingId !== null}
              className={[
                "border border-[#E5E5E5] dark:border-[#2A2A2A]",
                loadingId === wallet.id ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-white dark:bg-[#1A1A1A] hover:bg-[#F5F5F5] dark:hover:bg-[#2A2A2A]",
              ].join(" ")}
              style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", borderRadius: "14px", cursor: loadingId !== null ? "not-allowed" : "pointer", transition: "all 0.15s", textAlign: "left", width: "100%" }}
            >
              <div className="bg-[#F5F5F5] dark:bg-[#2A2A2A]" style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                <Image src={wallet.icon} alt={wallet.name} width={36} height={36} style={{ objectFit: "cover", borderRadius: "50%", width: "100%", height: "100%" }} />
              </div>
              <div style={{ flex: 1 }}>
                <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>{wallet.name}</p>
                <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px" }}>{wallet.description}</p>
              </div>
              {loadingId === wallet.id ? (
                <Icon icon="svg-spinners:ring-resize" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "18px" }} />
              ) : (
                <Icon icon="ph:arrow-right-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "16px" }} />
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-[#FEF2F2] dark:bg-[#2D1515] border border-[#FECACA] dark:border-[#5C2828]" style={{ padding: "10px 14px", borderRadius: "10px" }}>
            <p style={{ fontSize: "12px", color: "#B91C1C" }}>{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-[#F5F5F5] dark:border-[#232323]" style={{ paddingTop: "8px", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>
            Don&apos;t have a wallet?{" "}
            <a href="https://www.freighter.app" target="_blank" rel="noreferrer" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontWeight: 700, textDecoration: "none" }}>
              Get Freighter →
            </a>
          </p>
          <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>
            Or try{" "}
            <a href="https://xbull.app" target="_blank" rel="noreferrer" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontWeight: 700, textDecoration: "none" }}>
              xBull →
            </a>
          </p>
        </div>
      </div>
    </Modal>
  );
}
