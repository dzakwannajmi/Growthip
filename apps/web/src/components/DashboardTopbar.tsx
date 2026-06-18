"use client";

import { useState, useRef, useEffect } from "react";
import { Icon } from "@iconify/react";

type Network = "testnet" | "futurenet";

interface Toast {
  id: number;
  message: string;
  type: "info" | "warning";
}

export default function DashboardTopbar() {
  const [networkOpen, setNetworkOpen]     = useState(false);
  const [activeNetwork, setActiveNetwork] = useState<Network>("testnet");
  const [toasts, setToasts]               = useState<Toast[]>([]);
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

                  {/* Mainnet - coming soon */}
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

          {/* Avatar pill */}
          <div className="flex items-center gap-3 p-1.5 pr-4 rounded-full" style={{ background: "#F5F5F5", border: "1px solid #E5E5E5" }}>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-xs">
              CR
            </div>
            <span className="text-sm font-semibold hidden sm:block" style={{ color: "#171717" }}>
              @creator
            </span>
          </div>
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