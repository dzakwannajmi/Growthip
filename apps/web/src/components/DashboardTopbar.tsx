"use client";

import { useState, useRef, useEffect } from "react";
import { Globe, Check, Wallet } from "lucide-react";

type Network = "testnet" | "futurenet";

interface Toast {
  id: number;
  message: string;
  type: "info" | "warning";
}

export default function DashboardTopbar() {
  const [networkOpen, setNetworkOpen]       = useState(false);
  const [activeNetwork, setActiveNetwork]   = useState<Network>("testnet");
  const [toasts, setToasts]                 = useState<Toast[]>([]);
  const dropdownRef                         = useRef<HTMLDivElement>(null);

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
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }

  function handleNetworkSelect(network: Network | "coming-soon", name: string) {
    if (network === "coming-soon") {
      showToast(`${name} is not yet available. Coming soon!`, "warning");
      setNetworkOpen(false);
      return;
    }
    setActiveNetwork(network);
    showToast(`Switched to ${name}`);
    setNetworkOpen(false);
  }

  const dotColor = activeNetwork === "futurenet" ? "bg-green-500" : "bg-pink-500";

  return (
    <>
      {/* Topbar */}
      <div className="w-full flex items-center justify-between px-6 md:px-8 py-3 border-b border-light-200 dark:border-dark-100/50 bg-light-50/80 dark:bg-dark-base/80 backdrop-blur-md sticky top-0 z-10">
        {/* Left: page title placeholder (filled by each page) */}
        <div />

        {/* Right: network selector + avatar */}
        <div className="flex items-center gap-3">

          {/* Network Selector */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setNetworkOpen(!networkOpen)}
              className="w-10 h-10 rounded-full bg-light-100 dark:bg-dark-50 border border-light-200 dark:border-dark-100 flex items-center justify-center hover:bg-light-200 dark:hover:bg-dark-100 transition-colors relative"
              aria-label="Select Network"
            >
              <Globe size={18} className="text-light-600 dark:text-dark-400" />
              <span className={`absolute top-0 right-0 w-2.5 h-2.5 ${dotColor} rounded-full border-2 border-light-50 dark:border-dark-base`} />
            </button>

            {networkOpen && (
              <div className="absolute right-0 top-full mt-3 w-56 bg-light-50 dark:bg-dark-100 border border-light-200 dark:border-dark-200 rounded-xl shadow-xl z-50 overflow-hidden">
                <div className="p-2 flex flex-col gap-0.5">

                  {/* Futurenet */}
                  <button
                    onClick={() => handleNetworkSelect("futurenet", "Future Net")}
                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-light-100 dark:hover:bg-dark-200 transition-colors w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-green-500" />
                      <span className="text-[13px] font-semibold text-light-900 dark:text-dark-900">Future Net</span>
                    </div>
                    {activeNetwork === "futurenet" && (
                      <Check size={14} className="text-light-950 dark:text-dark-950" />
                    )}
                  </button>

                  {/* Testnet */}
                  <button
                    onClick={() => handleNetworkSelect("testnet", "Test Net")}
                    className={
                      "flex items-center justify-between p-2.5 rounded-lg hover:bg-light-100 dark:hover:bg-dark-200 transition-colors w-full text-left " +
                      (activeNetwork === "testnet" ? "bg-light-100/50 dark:bg-dark-200/50" : "")
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-pink-500" />
                      <span className="text-[13px] font-semibold text-light-900 dark:text-dark-900">Test Net</span>
                    </div>
                    {activeNetwork === "testnet" && (
                      <Check size={14} className="text-light-950 dark:text-dark-950" />
                    )}
                  </button>

                  <div className="h-px bg-light-200 dark:bg-dark-200 my-1 mx-2" />

                  {/* Mainnet - coming soon */}
                  <button
                    onClick={() => handleNetworkSelect("coming-soon", "Mainnet")}
                    className="flex items-center justify-between p-2.5 rounded-lg w-full text-left opacity-40 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <Globe size={16} className="text-pink-600" />
                      <span className="text-[13px] font-semibold text-light-900 dark:text-dark-900">Mainnet</span>
                    </div>
                    <span className="text-[9px] uppercase font-bold text-light-500 dark:text-dark-500 bg-light-200 dark:bg-dark-200 px-1.5 py-0.5 rounded">Soon</span>
                  </button>

                  {/* Custom Node - coming soon */}
                  <button
                    onClick={() => handleNetworkSelect("coming-soon", "Custom Node")}
                    className="flex items-center justify-between p-2.5 rounded-lg w-full text-left opacity-40 cursor-not-allowed"
                  >
                    <div className="flex items-center gap-3">
                      <Wallet size={16} className="text-light-500 dark:text-dark-500" />
                      <span className="text-[13px] font-semibold text-light-900 dark:text-dark-900">Custom Node</span>
                    </div>
                    <span className="text-[9px] uppercase font-bold text-light-500 dark:text-dark-500 bg-light-200 dark:bg-dark-200 px-1.5 py-0.5 rounded">Soon</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Avatar pill */}
          <div className="flex items-center gap-3 bg-light-100 dark:bg-dark-50 p-1.5 pr-4 rounded-full border border-light-200 dark:border-dark-100">
            <div className="w-8 h-8 rounded-full bg-light-300 dark:bg-dark-200 flex items-center justify-center font-bold text-light-950 dark:text-dark-950 text-xs">
              C
            </div>
            <span className="text-sm font-semibold text-light-900 dark:text-dark-800 hidden sm:block">
              @creator
            </span>
          </div>
        </div>
      </div>

      {/* Toast container */}
      <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={
              "flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-lg text-sm font-semibold pointer-events-auto animate-in slide-in-from-right-4 duration-300 " +
              (toast.type === "warning"
                ? "bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400"
                : "bg-light-base dark:bg-dark-100 border-light-200 dark:border-dark-200 text-light-950 dark:text-dark-950")
            }
          >
            <span>{toast.type === "warning" ? "⚠️" : "✅"}</span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </>
  );
}