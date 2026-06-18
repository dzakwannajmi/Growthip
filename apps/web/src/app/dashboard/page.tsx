"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

interface TokenPrice {
  percent: string;
  isUp: boolean;
}

function useLivePrices() {
  const [xlm, setXlm]   = useState<TokenPrice>({ percent: "+2.45%", isUp: true });
  const [usdc, setUsdc] = useState<TokenPrice>({ percent: "+0.01%", isUp: true });
  const [total, setTotal] = useState<{ percent: string; value: string; isUp: boolean }>({
    percent: "+0.00%", value: "(+$0.00)", isUp: true,
  });

  useEffect(() => {
    function tick() {
      function move(vol: number) {
        const isUp = Math.random() > 0.45;
        const pct  = (Math.random() * vol).toFixed(2);
        return { percent: `${isUp ? "+" : "-"}${pct}%`, isUp };
      }
      const nx = move(5.0);
      const nu = move(0.05);
      const nt = move(3.0);
      const dc = (1000 * Math.abs(parseFloat(nt.percent)) / 100).toFixed(2);
      setXlm(nx);
      setUsdc(nu);
      setTotal({ percent: nt.percent, value: `(${nt.isUp ? "+" : "-"}$${dc})`, isUp: nt.isUp });
    }
    const t = setTimeout(tick, 1000);
    const i = setInterval(tick, 4500);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return { xlm, usdc, total };
}

export default function DashboardMainPage() {
  const { xlm, usdc, total } = useLivePrices();
  const [copied, setCopied]  = useState(false);

  function copyLink() {
    navigator.clipboard.writeText("https://growthip.vercel.app/tip/creator");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-4 md:p-8 lg:p-10 w-full" style={{ background: "#FAFAFA" }}>
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">

        {/* Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-[#0A0A0A]">Dashboard</h1>
          <p className="text-sm text-light-600 dark:text-dark-500">Welcome back, @creator!</p>
        </div>

        {/* Stealth Balances */}
        <div className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-bold text-sm text-[#171717]">Your Stealth Balances</h2>
            <Icon icon="ph:info" className="text-light-400 dark:text-dark-500 text-xs cursor-help" />
          </div>

          <div className="mb-6 flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-extrabold text-[#0A0A0A] tracking-tight">$0.00</span>
              <span className="text-sm font-semibold text-[#737373] mb-1.5">USD</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`flex items-center text-[13px] font-bold transition-colors duration-500 ${total.isUp ? "text-green-500" : "text-red-500"}`}>
                <Icon icon={total.isUp ? "ph:trend-up-bold" : "ph:trend-down-bold"} className="mr-1" />
                {total.percent}
              </span>
              <span className={`text-[13px] font-medium transition-colors duration-500 ${total.isUp ? "text-green-500/80" : "text-red-500/80"}`}>
                {total.value}
              </span>
            </div>
          </div>

          <h3 className="text-xs font-semibold text-[#737373] uppercase tracking-widest mb-4">Tokens</h3>

          <div className="space-y-5">
            {/* XLM */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                  <Icon icon="cryptocurrency-color:xlm" className="text-xl" />
                </div>
                <div>
                  <div className="font-bold text-sm text-[#0A0A0A]">XLM</div>
                  <div className="text-[11px] text-[#737373]">Stellar Network</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="font-bold text-sm text-[#0A0A0A]">0</div>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center text-[10px] font-bold transition-colors ${xlm.isUp ? "text-green-500" : "text-red-500"}`}>
                    <Icon icon={xlm.isUp ? "ph:trend-up-bold" : "ph:trend-down-bold"} className="mr-0.5" />
                    {xlm.percent}
                  </span>
                  <div className="text-[11px] text-[#737373]">$0.00</div>
                </div>
              </div>
            </div>

            {/* USDC */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center">
                  <Icon icon="cryptocurrency-color:usdc" className="text-xl" />
                </div>
                <div>
                  <div className="font-bold text-sm text-[#0A0A0A]">USDC</div>
                  <div className="text-[11px] text-[#737373]">USD Coin</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="font-bold text-sm text-[#0A0A0A]">0</div>
                <div className="flex items-center gap-2">
                  <span className={`flex items-center text-[10px] font-bold transition-colors ${usdc.isUp ? "text-green-500" : "text-red-500"}`}>
                    <Icon icon={usdc.isUp ? "ph:trend-up-bold" : "ph:trend-down-bold"} className="mr-0.5" />
                    {usdc.percent}
                  </span>
                  <div className="text-[11px] text-[#737373]">$0.00</div>
                </div>
              </div>
            </div>

            {/* EURC */}
            <div className="flex items-center justify-between opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F5F5F5] flex items-center justify-center text-[#525252]">
                  <Icon icon="fa6-solid:euro-sign" className="text-sm" />
                </div>
                <div>
                  <div className="font-bold text-sm text-light-950 dark:text-dark-900 flex items-center gap-2">
                    EURC
                    <span className="px-1.5 py-0.5 rounded bg-[#E5E5E5] text-[#525252] text-[9px] font-bold uppercase tracking-wider">Coming Soon</span>
                  </div>
                  <div className="text-[11px] text-[#737373]">Euro Coin</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-[#0A0A0A]">-</div>
                <div className="text-[11px] text-[#737373]">€0.00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-6">
          <h2 className="font-bold text-sm text-[#171717] flex items-center gap-2 mb-1">
            <Icon icon="ph:wallet-bold" className="text-lg" /> Wallet Connection
          </h2>
          <p className="text-[13px] text-[#525252] mb-5">
            Connect a wallet to withdraw your tips and upgrade to Premium.
          </p>
          <button className="w-full bg-[#0A0A0A] text-white font-bold text-sm py-3 rounded-xl hover:opacity-90 flex items-center justify-center gap-2 transition-opacity">
            <Icon icon="ph:wallet" className="text-lg" /> Connect Wallet
          </button>
        </div>

        {/* Personal Link */}
        <div className="w-full bg-white rounded-2xl border border-[#E5E5E5] p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-bold text-sm text-[#171717] mb-0.5">Your Personal Link</h2>
              <p className="text-[13px] text-[#525252]">Share to get paid</p>
            </div>
            <button className="px-3 py-1.5 border border-[#E5E5E5] rounded-lg text-xs font-semibold text-[#404040] hover:bg-[#F5F5F5] transition-colors flex items-center gap-1">
              <Icon icon="ph:pencil-simple-bold" /> Edit Profile
            </button>
          </div>

          <div className="bg-[#FAFAFA] rounded-xl p-4 border border-[#E5E5E5] flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-lg">CR</div>
            <div>
              <div className="font-bold text-sm text-[#0A0A0A]">@creator</div>
              <div className="text-[13px] text-[#737373]">growthip.vercel.app/tip/creator</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] text-[#171717] font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-[13px]"
            >
              <Icon icon="ph:copy-simple-bold" className="text-lg" />
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl transition-colors text-[#404040]">
              <Icon icon="ph:share-network-bold" className="text-lg" />
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl transition-colors text-[#404040]">
              <Icon icon="ph:qr-code-bold" className="text-lg" />
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-[#FAFAFA] hover:bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl transition-colors text-[#404040]">
              <Icon icon="ph:arrow-square-out-bold" className="text-lg" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}