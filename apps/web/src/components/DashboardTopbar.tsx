"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";
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
    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 14px 6px 6px", borderRadius: "999px", background: "#F5F5F5", border: "1px solid #E5E5E5" }}>
      <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", background: "#E5E5E5", flexShrink: 0 }}>
        {address ? (
          <img src={avatarUrlFor(address)} alt="avatar" width={32} height={32} style={{ width: 32, height: 32 }} />
        ) : (
          <div style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "#A3A3A3" }}>?</div>
        )}
      </div>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#171717" }} className="hidden sm:block">
        {label}
      </span>
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
        {/* Mobile hamburger */}
        <button className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-light-600 dark:text-dark-400 hover:bg-light-200 dark:hover:bg-dark-100 transition-colors">
          <Icon icon="ph:list-bold" className="text-xl" />
        </button>

        <div className="flex items-center gap-3 ml-auto">
          {/* Network selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setNetworkOpen(!networkOpen)}
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#F5F5F5] transition-colors relative" style={{ background: "#F5F5F5", border: "1px solid #E5E5E5" }}
            >
              <Icon icon="ph:globe" className="text-xl text-light-600 dark:text-dark-400" />
              <span className={`absolute top-0 right-0 w-2.5 h-2.5 ${dotColor} rounded-full border-2 border-light-50 dark:border-dark-base`} />
            </button>

            {networkOpen && (
              <div className="absolute right-0 top-full mt-3 z-50" style={{ width: "224px" }}>
                <div style={{ padding: "8px", display: "flex", flexDirection: "column", gap: "2px", background: "white", borderRadius: "12px", border: "1px solid #E5E5E5" }}>

                  {/* Futurenet */}
                  <button
                    onClick={() => handleNetworkSelect("futurenet", "Future Net")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", background: activeNetwork === "futurenet" ? "#F5F5F5" : "transparent", border: "none", cursor: "pointer", width: "100%", transition: "background 0.15s" }}
                    onMouseEnter={(e) => { if (activeNetwork !== "futurenet") (e.currentTarget as HTMLButtonElement).style.background = "#F5F5F5"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = activeNetwork === "futurenet" ? "#F5F5F5" : "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon="ph:globe-hemisphere-west-bold" style={{ fontSize: "18px", color: "#22c55e" }} />
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#171717" }}>Future Net</span>
                    </div>
                    {activeNetwork === "futurenet" && (
                      <Icon icon="ph:check-bold" style={{ fontSize: "14px", color: "#171717" }} />
                    )}
                  </button>

                  {/* Testnet - active */}
                  <button
                    onClick={() => handleNetworkSelect("testnet", "Test Net")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", background: activeNetwork === "testnet" ? "#F5F5F5" : "transparent", border: "none", cursor: "pointer", width: "100%", transition: "background 0.15s" }}
                    onMouseEnter={(e) => { if (activeNetwork !== "testnet") (e.currentTarget as HTMLButtonElement).style.background = "#F5F5F5"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = activeNetwork === "testnet" ? "#F5F5F5" : "transparent"; }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon="ph:globe-hemisphere-east-bold" style={{ fontSize: "18px", color: "#ec4899" }} />
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#171717" }}>Test Net</span>
                    </div>
                    {activeNetwork === "testnet" && (
                      <Icon icon="ph:check-bold" style={{ fontSize: "14px", color: "#171717" }} />
                    )}
                  </button>

                  <div className="h-px my-1 mx-2" style={{ background: "#E5E5E5" }} />

                  {/* Mainnet - coming soon -- intentionally disabled, see
                      project decision: no contracts are deployed to
                      mainnet, this protocol is unaudited, and the ZK
                      trusted setup is not a public ceremony. Do not wire
                      this up to a real network switch without addressing
                      those first. */}
                  <button
                    onClick={() => handleNetworkSelect("coming-soon", "Mainnet")}
                    className="flex items-center justify-between p-2.5 rounded-lg w-full text-left opacity-40 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <Icon icon="ph:globe" className="text-pink-600 text-lg" />
                      <span className="text-[13px] font-semibold text-[#171717]">Mainnet</span>
                    </div>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ color: "#737373", background: "#E5E5E5" }}>Soon</span>
                  </button>

                  {/* Custom node - coming soon */}
                  <button
                    onClick={() => handleNetworkSelect("coming-soon", "Custom Node")}
                    className="flex items-center justify-between p-2.5 rounded-lg w-full text-left opacity-40 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <Icon icon="ph:plugs-connected" className="text-light-500 dark:text-dark-500 text-lg" />
                      <span className="text-[13px] font-semibold text-[#171717]">Custom Node</span>
                    </div>
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded" style={{ color: "#737373", background: "#E5E5E5" }}>Soon</span>
                  </button>
                </div>
              </div>
            )}
          </div>

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