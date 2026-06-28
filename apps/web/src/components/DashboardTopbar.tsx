"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
import WalletModal from "@/components/WalletModal";
import { getProfile, avatarUrlFor } from "@/lib/profile";

type Network = "testnet" | "futurenet";

interface Toast {
  id: number;
  message: string;
  type: "info" | "warning";
}

function WalletAvatar() {
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showWalletModal, setShowWalletModal] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const load = () => setAddress(localStorage.getItem("growthip:wallet") ?? "");
    load();
    const interval = setInterval(load, 1000);
    return () => clearInterval(interval);
  }, []);

  // Pulls the same local display-name/avatar set on the Settings page --
  // this keeps the topbar consistent with what the creator actually
  // configured, instead of always falling back to a placeholder.
  //
  // Polled on the same 1s interval as the address itself (see above),
  // not just re-read on address change -- otherwise switching the
  // avatar variant on the Settings page wouldn't be reflected here
  // until a full remount (e.g. navigating away and back), since
  // localStorage writes don't trigger React re-renders on their own.
  const [profileVersion, setProfileVersion] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const interval = setInterval(() => setProfileVersion((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!address) { setDisplayName(""); return; }
    setDisplayName(getProfile(address).displayName);
  }, [address, profileVersion]);

  const shortAddr = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "Not connected";

  const label = displayName || shortAddr;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {!address ? (
        <button
          onClick={() => setShowWalletModal(true)}
          style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px", borderRadius: "999px", background: "#0A0A0A", color: "white", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}
        >
          <Icon icon="ph:wallet-bold" style={{ fontSize: "15px" }} />
          <span className="hidden sm:block">Connect Wallet</span>
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px 6px 6px", borderRadius: "999px", background: "#F5F5F5", border: "1px solid #E5E5E5" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "#E5E5E5", flexShrink: 0 }}>
            <img src={avatarUrlFor(address)} alt="avatar" width={32} height={32} style={{ width: 32, height: 32 }} />
          </div>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#171717" }} className="hidden sm:block">
            {label}
          </span>
          <button
            title="Switch wallet"
            onClick={() => setShowWalletModal(true)}
            style={{ width: 28, height: 28, borderRadius: "8px", border: "1px solid #E5E5E5", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F5F5F5"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
          >
            <Icon icon="ph:arrows-left-right-bold" style={{ fontSize: "13px", color: "#525252" }} />
          </button>
          <button
            title="Disconnect wallet"
            onClick={() => {
              localStorage.removeItem("growthip:wallet");
              localStorage.removeItem("growthip:walletId");
              localStorage.removeItem("growthip:network");
              setAddress("");
              import("@/lib/wallet").then(({ disconnectWallet }) => disconnectWallet());
            }}
            style={{ width: 28, height: 28, borderRadius: "8px", border: "1px solid #E5E5E5", background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
          >
            <Icon icon="ph:sign-out-bold" style={{ fontSize: "13px", color: "#EF4444" }} />
          </button>
        </div>
      )}
      {showWalletModal && (
        <WalletModal
          onClose={() => setShowWalletModal(false)}
          onSelectWallet={async (walletId) => {
            try {
              const { connectWithWallet } = await import("@/lib/wallet");
              const addr = await connectWithWallet(walletId);
              localStorage.setItem("growthip:wallet", addr);
              localStorage.setItem("growthip:walletId", walletId);
              setAddress(addr);
              setShowWalletModal(false);
            } catch (err) {
              console.error("Wallet switch failed:", err);
            }
          }}
        />
      )}
    </div>
  );
}

export default function DashboardTopbar() {
  const [networkOpen, setNetworkOpen]     = useState(false);
  const [activeNetwork, setActiveNetwork] = useState<Network>("testnet");
  const [toasts, setToasts]               = useState<Toast[]>([]);
  const [encLocked, setEncLocked]         = useState(true);
  const [showUnlock, setShowUnlock]       = useState(false);
  const [unlockPw, setUnlockPw]           = useState("");
  const [unlockBusy, setUnlockBusy]       = useState(false);
  const [unlockErr, setUnlockErr]         = useState("");
  const unlockRef                         = useRef<HTMLDivElement>(null);

  // Poll encryption session status every 2s
  useEffect(() => {
    const check = async () => {
      try {
        const { isUnlocked } = await import("@/lib/encryption/keyManagement");
        setEncLocked(!isUnlocked());
      } catch { setEncLocked(true); }
    };
    check();
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, []);

  // Close unlock popup on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (unlockRef.current && !unlockRef.current.contains(e.target as Node)) {
        setShowUnlock(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleUnlock() {
    setUnlockBusy(true);
    setUnlockErr("");
    try {
      const { unlockWithPassword } = await import("@/lib/encryption/keyManagement");
      await unlockWithPassword(unlockPw);
      setEncLocked(false);
      setShowUnlock(false);
      setUnlockPw("");
      showToast("Encryption unlocked — pending tips will now load");
    } catch { setUnlockErr("Wrong password."); }
    finally { setUnlockBusy(false); }
  }
  const dropdownRef                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNetworkOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function showToast(message: string, type: "info" | "warning" = "info") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  function handleNetworkSelect(network: Network | "coming-soon", name: string) {
    if (network === "coming-soon") {
      showToast(`${name} is not yet available. Coming soon!`, "warning");
      setNetworkOpen(false);
      return;
    }
    setActiveNetwork(network);
    showToast(`Successfully switched to ${name}`);
    setNetworkOpen(false);
  }

  const dotColor = activeNetwork === "futurenet" ? "bg-green-500" : "bg-pink-500";

  return (
    <>
      <div className="w-full flex items-center justify-between p-4 md:px-8 lg:px-10 border-b border-[#E5E5E5] bg-white sticky top-0 z-10">

          {/* Encryption status badge */}
          <div style={{ position: "relative" }} ref={unlockRef}>
            <button
              onClick={() => { setShowUnlock(!showUnlock); setUnlockErr(""); }}
              style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, border: "none", cursor: "pointer", background: encLocked ? "#FEF2F2" : "#F0FDF4", color: encLocked ? "#EF4444" : "#22c55e", transition: "all 0.2s" }}
            >
              <Icon icon={encLocked ? "ph:lock-key-bold" : "ph:lock-key-open-bold"} style={{ fontSize: "14px" }} />
              {encLocked ? "Locked" : "Active"}
            </button>
            {showUnlock && encLocked && (
              <div style={{ position: "absolute", right: 0, top: "calc(100% + 10px)", background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", padding: "16px", zIndex: 100, width: "280px", display: "flex", flexDirection: "column", gap: "10px" }}>
                <p style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>🔐 Unlock Encryption</p>
                <p style={{ fontSize: "12px", color: "#737373" }}>Enter your password to decrypt incoming tips automatically.</p>
                <input
                  type="password"
                  placeholder="Encryption password..."
                  value={unlockPw}
                  onChange={(e) => setUnlockPw(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !unlockBusy) handleUnlock(); }}
                  style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #E5E5E5", fontSize: "13px", outline: "none", width: "100%" }}
                />
                {unlockErr && <p style={{ fontSize: "12px", color: "#EF4444" }}>{unlockErr}</p>}
                <button
                  onClick={handleUnlock}
                  disabled={unlockBusy || !unlockPw.trim()}
                  style={{ padding: "10px", borderRadius: "10px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: unlockBusy ? "not-allowed" : "pointer", opacity: unlockBusy || !unlockPw.trim() ? 0.5 : 1 }}
                >
                  {unlockBusy ? "Unlocking..." : "Unlock"}
                </button>
              </div>
            )}
          </div>

          {/* Avatar pill -- real connected wallet + profile, not a placeholder */}
          <WalletAvatar />
        </div>
      </div>

      {/* Toast */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              "flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg text-sm font-semibold pointer-events-auto " +
              (toast.type === "warning"
                ? "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400"
                : "bg-light-base dark:bg-dark-50 border-light-200 dark:border-dark-100 text-light-950 dark:text-dark-950")
            }
          >
            <Icon
              icon={toast.type === "warning" ? "ph:warning-circle-fill" : "ph:check-circle-fill"}
              className={toast.type === "warning" ? "text-orange-500 text-lg" : "text-green-500 text-lg"}
            />
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}