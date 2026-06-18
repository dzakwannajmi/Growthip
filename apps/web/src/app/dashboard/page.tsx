"use client";

import { useEffect, useState } from "react";
import { Info, Wallet, Copy, Share2, QrCode, ExternalLink, Pencil, TrendingUp, TrendingDown } from "lucide-react";

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

  function randomMove(volatility: number) {
    const isUp = Math.random() > 0.45;
    const pct  = (Math.random() * volatility).toFixed(2);
    return { percent: `${isUp ? "+" : "-"}${pct}%`, isUp };
  }

  useEffect(() => {
    function tick() {
      const newXlm  = randomMove(5.0);
      const newUsdc = randomMove(0.05);
      const newTotal = randomMove(3.0);
      const dollarChange = (1000 * (parseFloat(newTotal.percent) / 100)).toFixed(2);

      setXlm(newXlm);
      setUsdc(newUsdc);
      setTotal({
        percent: newTotal.percent,
        value: `(${newTotal.isUp ? "+" : "-"}$${Math.abs(Number(dollarChange)).toFixed(2)})`,
        isUp: newTotal.isUp,
      });
    }

    const timer = setTimeout(tick, 1000);
    const interval = setInterval(tick, 4500);
    return () => { clearTimeout(timer); clearInterval(interval); };
  }, []);

  return { xlm, usdc, total };
}

function PriceIndicator({ percent, isUp }: TokenPrice) {
  return (
    <span className={
      "flex items-center text-[10px] font-bold transition-colors duration-500 " +
      (isUp ? "text-green-500" : "text-red-500")
    }>
      {isUp ? <TrendingUp size={10} className="mr-0.5" /> : <TrendingDown size={10} className="mr-0.5" />}
      {percent}
    </span>
  );
}

export default function DashboardMainPage() {
  const { xlm, usdc, total } = useLivePrices();
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText("https://growthip.vercel.app/tip/creator");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scroll p-4 md:p-8 lg:p-10 w-full bg-light-50 dark:bg-dark-base text-light-900 dark:text-dark-900">
      <div className="max-w-[700px] mx-auto pb-20 flex flex-col gap-6">

        {/* Page Header */}
        <div className="mb-2">
          <h1 className="text-2xl font-extrabold text-light-950 dark:text-dark-950">Dashboard</h1>
          <p className="text-sm text-light-600 dark:text-dark-500">Welcome back, @creator!</p>
        </div>

        {/* Stealth Balances Card */}
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-6">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="font-bold text-sm text-light-900 dark:text-dark-900">Your Stealth Balances</h2>
            <Info size={12} className="text-light-400 dark:text-dark-500 cursor-help" />
          </div>

          <div className="mb-6 flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <span className="text-5xl font-extrabold text-light-950 dark:text-dark-950 tracking-tight">
                $0.00
              </span>
              <span className="text-sm font-semibold text-light-500 dark:text-dark-600 mb-1.5">USD</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={
                "flex items-center text-[13px] font-bold transition-colors duration-500 " +
                (total.isUp ? "text-green-500" : "text-red-500")
              }>
                {total.isUp
                  ? <TrendingUp size={13} className="mr-1" />
                  : <TrendingDown size={13} className="mr-1" />}
                {total.percent}
              </span>
              <span className={
                "text-[13px] font-medium transition-colors duration-500 " +
                (total.isUp ? "text-green-500/80" : "text-red-500/80")
              }>
                {total.value}
              </span>
            </div>
          </div>

          <h3 className="text-xs font-semibold text-light-500 dark:text-dark-600 uppercase tracking-widest mb-4">
            Tokens
          </h3>

          <div className="space-y-5">
            {/* XLM */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-light-100 dark:bg-dark-100 flex items-center justify-center text-sm font-black text-light-950 dark:text-dark-950">
                  ✦
                </div>
                <div>
                  <div className="font-bold text-sm text-light-950 dark:text-dark-900">XLM</div>
                  <div className="text-[11px] text-light-500 dark:text-dark-600">Stellar Network</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="font-bold text-sm text-light-950 dark:text-dark-900">0</div>
                <div className="flex items-center gap-2">
                  <PriceIndicator {...xlm} />
                  <div className="text-[11px] text-light-500 dark:text-dark-600">$0.00</div>
                </div>
              </div>
            </div>

            {/* USDC */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-light-100 dark:bg-dark-100 flex items-center justify-center text-sm font-black text-blue-500">
                  $
                </div>
                <div>
                  <div className="font-bold text-sm text-light-950 dark:text-dark-900">USDC</div>
                  <div className="text-[11px] text-light-500 dark:text-dark-600">USD Coin</div>
                </div>
              </div>
              <div className="text-right flex flex-col items-end">
                <div className="font-bold text-sm text-light-950 dark:text-dark-900">0</div>
                <div className="flex items-center gap-2">
                  <PriceIndicator {...usdc} />
                  <div className="text-[11px] text-light-500 dark:text-dark-600">$0.00</div>
                </div>
              </div>
            </div>

            {/* EURC - coming soon */}
            <div className="flex items-center justify-between opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-light-100 dark:bg-dark-100 flex items-center justify-center text-light-600 dark:text-dark-400 text-sm font-bold">
                  €
                </div>
                <div>
                  <div className="font-bold text-sm text-light-950 dark:text-dark-900 flex items-center gap-2">
                    EURC
                    <span className="px-1.5 py-0.5 rounded bg-light-200 dark:bg-dark-200 text-light-600 dark:text-dark-400 text-[9px] font-bold uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <div className="text-[11px] text-light-500 dark:text-dark-600">Euro Coin</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold text-sm text-light-950 dark:text-dark-900">-</div>
                <div className="text-[11px] text-light-500 dark:text-dark-600">€0.00</div>
              </div>
            </div>
          </div>
        </div>

        {/* Wallet Connection Card */}
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-6">
          <h2 className="font-bold text-sm text-light-900 dark:text-dark-900 flex items-center gap-2 mb-1">
            <Wallet size={16} />
            Wallet Connection
          </h2>
          <p className="text-[13px] text-light-600 dark:text-dark-500 mb-5">
            Connect a wallet to withdraw your tips and upgrade to Premium.
          </p>
          <button className="w-full bg-light-950 dark:bg-dark-950 text-light-base dark:text-dark-base font-bold text-sm py-3 rounded-xl transition-opacity hover:opacity-90 flex items-center justify-center gap-2">
            <Wallet size={16} />
            Connect Wallet
          </button>
        </div>

        {/* Personal Link Card */}
        <div className="w-full bg-light-base dark:bg-dark-50 rounded-2xl border border-light-200 dark:border-dark-100 p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-bold text-sm text-light-900 dark:text-dark-900 mb-0.5">
                Your Personal Link
              </h2>
              <p className="text-[13px] text-light-600 dark:text-dark-500">Share to get paid</p>
            </div>
            <button className="px-3 py-1.5 border border-light-200 dark:border-dark-200 rounded-lg text-xs font-semibold text-light-700 dark:text-dark-400 hover:bg-light-100 dark:hover:bg-dark-100 transition-colors flex items-center gap-1">
              <Pencil size={11} />
              Edit Profile
            </button>
          </div>

          <div className="bg-light-50 dark:bg-dark-100 rounded-xl p-4 border border-light-200 dark:border-dark-200 flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-light-200 dark:bg-dark-200 flex items-center justify-center font-bold text-light-950 dark:text-dark-950 text-lg">
              C
            </div>
            <div>
              <div className="font-bold text-sm text-light-950 dark:text-dark-950">@creator</div>
              <div className="text-[13px] text-light-500 dark:text-dark-500">growthip.vercel.app/tip/creator</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 bg-light-50 dark:bg-dark-100 hover:bg-light-100 dark:hover:bg-dark-200 border border-light-200 dark:border-dark-200 text-light-900 dark:text-dark-900 font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-[13px]"
            >
              <Copy size={15} />
              {copied ? "Copied!" : "Copy Link"}
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-light-50 dark:bg-dark-100 hover:bg-light-100 dark:hover:bg-dark-200 border border-light-200 dark:border-dark-200 rounded-xl transition-colors text-light-700 dark:text-dark-400">
              <Share2 size={16} />
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-light-50 dark:bg-dark-100 hover:bg-light-100 dark:hover:bg-dark-200 border border-light-200 dark:border-dark-200 rounded-xl transition-colors text-light-700 dark:text-dark-400">
              <QrCode size={16} />
            </button>
            <button className="w-12 h-11 flex items-center justify-center bg-light-50 dark:bg-dark-100 hover:bg-light-100 dark:hover:bg-dark-200 border border-light-200 dark:border-dark-200 rounded-xl transition-colors text-light-700 dark:text-dark-400">
              <ExternalLink size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}