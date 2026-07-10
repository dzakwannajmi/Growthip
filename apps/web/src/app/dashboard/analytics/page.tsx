"use client";

import { useEffect, useState, useCallback } from "react";
import { Icon } from "@iconify/react";
import { config } from "@/lib/config";
import { SUPPORTED_TOKENS } from "@/lib/tokens";
import {
  getPendingNotes,
  getClaimedNotes,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";
import { isConnected, requestAccess } from "@stellar/freighter-api";
import { useRegistryClient } from "@/lib/registryClient";
import { usePrices } from "@/lib/useMarket";
import { useCurrency, formatMoney } from "@/lib/currency";
import Sparkline from "@/components/Sparkline";
import EarningsAreaChart from "@/components/EarningsAreaChart";



interface PoolStats {
  totalDeposits: number;
  totalClaims:   number;
  tipAmount:     number;
  token:         string;
}

const RPC_URL = config.network.rpcUrl;

async function fetchPoolStats(poolId: string, tokenSymbol: string): Promise<PoolStats> {
  const { Client, networks } = await import("@/lib/growthipPoolClient");
  const client = new Client({ ...networks.testnet, contractId: poolId, rpcUrl: RPC_URL });
  const [tipTx, depositsTx, claimsTx] = await Promise.all([
    client.tip_amount(),
    client.total_deposits(),
    client.total_claims(),
  ]);
  return {
    totalDeposits: Number(depositsTx.result ?? 0),
    totalClaims:   Number(claimsTx.result ?? 0),
    tipAmount:     Number(tipTx.result ?? 0),
    token:         tokenSymbol,
  };
}

function formatAmount(note: PrivateNote): string {
  const token = getToken(note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

const TOKEN_ICONS: Record<string, string> = {
  XLM:  "cryptocurrency-color:xlm",
  USDC: "cryptocurrency-color:usdc",
  EURC: "cryptocurrency-color:eur",
};

type TimeFilter = "30d" | "90d" | "all";

const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "all": "All time",
};

const TIME_FILTER_MS: Record<TimeFilter, number | null> = {
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
  "all": null,
};

export default function AnalyticsPage() {

  const [stats, setStats]     = useState<Record<string, PoolStats>>({});
  const [loading, setLoading] = useState(true);
  const { prices } = usePrices();
  const [currency] = useCurrency();
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);

  const availableTokens = SUPPORTED_TOKENS.filter((t) => t.available);

  // Analytics is a premium feature -- gated behind growthip-creator-registry's
  // is_premium(), same activation as private notes (Tahap 3 decision).
  const { isReady: registryReady, buildRegistryClient } = useRegistryClient();
  const [address, setAddress] = useState("");
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Only use address from explicit dashboard connect — not auto-detect
    const stored = localStorage.getItem("growthip:wallet");
    if (!stored) { setPremiumChecked(true); return; }
    setAddress(stored);
  }, []);

  useEffect(() => {
    if (!address || !registryReady) return;
    (async () => {
      try {
        const client = buildRegistryClient(address);
        const result = await client.is_premium({ recipient: address });
        setIsPremium(result.result === true);
      } catch (err) {
        console.error("Failed to check premium status:", err);
      } finally {
        setPremiumChecked(true);
      }
    })();
  }, [address, registryReady, buildRegistryClient]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        availableTokens.map((t) => fetchPoolStats(t.poolId, t.symbol))
      );
      const map: Record<string, PoolStats> = {};
      availableTokens.forEach((t, i) => { map[t.symbol] = results[i]; });
      setStats(map);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!address) { setPending([]); setClaimed([]); return; }
    const currentPoolId = process.env.NEXT_PUBLIC_POOL_ID;
    const currentUsdcPoolId = process.env.NEXT_PUBLIC_POOL_USDC_ID;
    const filterByPool = (notes: ReturnType<typeof getPendingNotes>) =>
      notes.filter((n) => {
        if (!n.poolId) return false; // legacy notes without poolId: hide
        if (n.token === "USDC") return n.poolId === currentUsdcPoolId;
        return n.poolId === currentPoolId;
      });
    setPending(filterByPool(getPendingNotes(address)));
    setClaimed(filterByPool(getClaimedNotes(address)));
  }, [address]);

  const allStats      = Object.values(stats);

  // Apply the selected time range to both lists before any derived stat
  // is computed, so summary cards / breakdowns / recent list all agree
  // with each other -- see discussion with Najmi: a filter that only
  // touched the "Recent Tips" list while leaving summary numbers as
  // all-time would look like a bug, not a feature.
  const rangeMs = TIME_FILTER_MS[timeFilter];
  const cutoff = rangeMs !== null ? Date.now() - rangeMs : null;
  const inRange = (n: PrivateNote) => {
    if (cutoff === null) return true;
    const ts = n.claimed && n.claimedAt ? n.claimedAt : n.timestamp;
    return ts >= cutoff;
  };
  const filteredClaimed = claimed.filter(inRange);
  const filteredPending = pending.filter(inRange);

  // Use per-wallet localStorage data instead of global pool stats
  const myTotalReceived = filteredClaimed.length + filteredPending.length;
  const myTotalClaimed  = filteredClaimed.length;
  const myTotalPending  = filteredPending.length;

  // Combined USD total across all tokens (claimed + pending, filtered by
  // the selected time range) -- sums each token's human-readable amount
  // separately, then converts each with its own live price and adds
  // them together. EURC excluded: not "available" yet, no price feed.
  const rateFor = (tokenSymbol: string): number => {
    if (tokenSymbol === "XLM")  return currency === "IDR" ? prices.xlm.idr  : prices.xlm.usd;
    if (tokenSymbol === "USDC") return currency === "IDR" ? prices.usdc.idr : prices.usdc.usd;
    return 0;
  };

  const combinedTotal = [...filteredClaimed, ...filteredPending].reduce((sum, n) => {
    const token = getToken(n.token);
    if (!token) return sum;
    const human = Number(n.amount) / Math.pow(10, token.decimals);
    return sum + human * rateFor(n.token);
  }, 0);

  // Sparkline trends -- always a fixed "last 14 days" window, independent
  // of the 30d/90d/all-time header filter (which scopes the headline
  // numbers). Mixing the two would make the sparkline's meaning shift
  // depending on the dropdown, which is more confusing than useful for
  // a small at-a-glance trend line. Uses the FULL claimed/pending lists,
  // not the filtered ones, for that reason.
  function bucketByDay(notes: PrivateNote[], dateOf: (n: PrivateNote) => number, days = 14): number[] {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const buckets = new Array(days).fill(0);
    for (const n of notes) {
      const daysAgo = Math.floor((now - dateOf(n)) / dayMs);
      if (daysAgo >= 0 && daysAgo < days) {
        buckets[days - 1 - daysAgo] += 1;
      }
    }
    return buckets;
  }

  const receivedTrend  = bucketByDay([...claimed, ...pending], (n) => n.timestamp);
  const withdrawnTrend = bucketByDay(claimed, (n) => n.claimedAt ?? n.timestamp);
  const pendingTrend   = bucketByDay(pending, (n) => n.timestamp);

  // Summary cards — all per-wallet
  const summaryCards = [
    {
      label: "Total Received",
      value: `${myTotalReceived} tips`,
      sub: "Across all tokens",
      icon: "ph:arrow-down-left-bold",
      iconColor: "#22c55e",
      iconBg: "#F0FDF4",
      sparklineData: receivedTrend,
    },
    {
      label: "Total Withdrawn",
      value: `${myTotalClaimed} tips`,
      sub: "Transferred to wallet",
      icon: "ph:arrow-up-right-bold",
      iconColor: "#6366f1",
      iconBg: "#EEF2FF",
      sparklineData: withdrawnTrend,
    },
    {
      label: "Total Tips",
      value: String(myTotalReceived),
      sub: "All time contributions",
      icon: "ph:gift-bold",
      iconColor: "#f59e0b",
      iconBg: "#FFFBEB",
      sparklineData: receivedTrend,
    },
    {
      label: "Pending Claims",
      value: String(myTotalPending),
      sub: "Waiting to be claimed",
      sparklineData: pendingTrend,
      icon: "ph:clock-bold",
      iconColor: "#ef4444",
      iconBg: "#FEF2F2",
    },
  ];

  // Not connected gate — show immediately without waiting for premium check
  if (!address) {
    return (
      <div className="bg-[#FAFAFA] dark:bg-[#0A0A0A]" style={{ padding: "32px", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "360px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div className="bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:wallet-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "32px" }} />
          </div>
          <p className="text-[#171717] dark:text-[#E5E5E5]" style={{ fontSize: "16px", fontWeight: 700 }}>Connect your wallet first</p>
          <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
            To see your analytics, you need to connect your Stellar wallet. It's like logging in — just one click and your earnings data will appear here.
          </p>
          
          <a
            href="/dashboard"
            className="bg-[#0A0A0A] text-white" style={{ marginTop: "8px", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Icon icon="ph:arrow-left-bold" style={{ fontSize: "14px" }} />
            Go to Dashboard to Connect
          </a>
        </div>
      </div>
    );
  }

  // Loading gate: while premium status is being fetched, render neither
  // the "not premium" gate NOR the real analytics content. Without this,
  // there's a window where address is set but premiumChecked is still
  // false -- the premium gate condition below (premiumChecked && !isPremium)
  // evaluates to false during that window, so render falls straight
  // through to the full analytics page underneath, briefly exposing
  // real data before the premium check resolves and re-renders correctly.
  if (address && !premiumChecked) {
    return (
      <div className="bg-[#FAFAFA] dark:bg-[#0A0A0A]" style={{ padding: "32px", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon icon="svg-spinners:ring-resize" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "32px" }} />
      </div>
    );
  }

  // Premium gate: Analytics is locked behind growthip-creator-registry's
  // is_premium(), the same activation flow as private notes.
  if (premiumChecked && !isPremium) {
    return (
      <div className="bg-[#FAFAFA] dark:bg-[#0A0A0A]" style={{ padding: "32px", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "360px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Icon icon="ph:chart-line-up-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "36px" }} />
          <p className="text-[#171717] dark:text-[#E5E5E5]" style={{ fontSize: "16px", fontWeight: 700 }}>Analytics is a Premium feature</p>
          <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
            Activate private notes (one-time 6 XLM) in Settings to unlock detailed analytics, alongside encrypted notes from supporters.
          </p>
          <a
            href="/dashboard/settings"
            className="bg-[#0A0A0A] text-white" style={{ marginTop: "8px", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#0A0A0A]" style={{ padding: "32px" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Icon icon="ph:chart-line-up-bold" style={{ fontSize: "24px", color: "#f59e0b" }} />
            <div>
              <h1 className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "24px", fontWeight: 800 }}>Analytics</h1>
              <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px" }}>Detailed insights into your earnings</p>
            </div>
          </div>

          {/* Time range filter -- scoped to the WHOLE page (summary cards,
              breakdowns, recent list), not just the recent-tips list.
              A filter that only touched one section while leaving the
              headline numbers unchanged would look like a bug. */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowTimeDropdown((p) => !p)}
              className="bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5]"
              style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}
            >
              {TIME_FILTER_LABELS[timeFilter]}
              <Icon icon="ph:caret-down-bold" style={{ fontSize: "11px", opacity: 0.6 }} />
            </button>
            {showTimeDropdown && (
              <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, borderRadius: "14px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 50, minWidth: "170px", padding: "6px" }}>
                {(["30d", "90d", "all"] as TimeFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => { setTimeFilter(f); setShowTimeDropdown(false); }}
                    className={["text-[#171717] dark:text-[#E5E5E5]", timeFilter === f ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: timeFilter === f ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                  >
                    {TIME_FILTER_LABELS[f]}
                    {timeFilter === f && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Total Earnings -- combined USD value across all tokens, using
            the shared usePrices() hook (same CoinGecko-backed price feed
            dashboard already uses) rather than a separate fetch. */}
        <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
          <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>Total Earnings ({TIME_FILTER_LABELS[timeFilter]})</p>
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "36px", fontWeight: 800, lineHeight: 1 }}>
            {loading ? "—" : formatMoney(combinedTotal, currency)}
          </p>
          <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px", marginTop: "6px" }}>Combined value across {availableTokens.length > 1 ? `${availableTokens.slice(0, -1).map((t) => t.symbol).join(", ")} and ${availableTokens[availableTokens.length - 1].symbol}` : availableTokens[0]?.symbol ?? "supported tokens"}</p>
        </div>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px" }}>
          {summaryCards.map((card) => (
            <div key={card.label} className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", fontWeight: 500 }}>{card.label}</p>
                <div style={{ width: 32, height: 32, borderRadius: "8px", background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={card.icon} style={{ fontSize: "16px", color: card.iconColor, WebkitTextFillColor: card.iconColor }} />
                </div>
              </div>
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "24px", fontWeight: 800 }}>{loading ? "—" : card.value}</p>
              <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px", marginTop: "4px", marginBottom: "8px" }}>{card.sub}</p>
              <Sparkline data={card.sparklineData} color={card.iconColor} width={140} height={28} />
            </div>
          ))}
        </div>

        {/* Pool breakdown + Average Tip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>

          {/* Received by Token */}
          <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:coins-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>Received by Token</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableTokens.map((token) => {
                const tokenNotes = [...filteredClaimed, ...filteredPending].filter((n) => n.token === token.symbol);
                const totalReceived = tokenNotes.reduce((sum, n) => sum + Number(n.amount) / 1e7, 0);
                const tipCount = tokenNotes.length;
                const convertedValue = totalReceived * rateFor(token.symbol);
                return (
                  <div key={token.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "36px" }} />
                      <div>
                        <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>{totalReceived % 1 === 0 ? totalReceived.toFixed(0) : totalReceived.toFixed(1)} {token.symbol}</p>
                        <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>{formatMoney(convertedValue, currency)}</p>
                      </div>
                    </div>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>{`${tipCount} tips`}</p>
                  </div>
                );
              })}
              {/* EURC coming soon */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon icon="cryptocurrency-color:eur" style={{ fontSize: "28px" }} />
                  <div>
                    <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>0 EURC</p>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>€0.00</p>
                  </div>
                </div>
                <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px" }}>Soon</span>
              </div>
            </div>
          </div>

          {/* Average Tip Amount */}
          <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:trend-up-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>Average Tip Amount</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableTokens.map((token) => {
                const tokenNotes = [...filteredClaimed, ...filteredPending].filter((n) => n.token === token.symbol);
                const avgAmount = tokenNotes.length > 0
                  ? tokenNotes.reduce((sum, n) => sum + Number(n.amount) / 1e7, 0) / tokenNotes.length
                  : 0;
                const avgHuman = avgAmount % 1 === 0 ? avgAmount.toFixed(0) : avgAmount.toFixed(1);
                const convertedValue = avgAmount * rateFor(token.symbol);
                return (
                  <div key={token.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "36px" }} />
                      <div>
                        <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>{tokenNotes.length > 0 ? avgHuman : "—"} {token.symbol}</p>
                        <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>{formatMoney(convertedValue, currency)}</p>
                      </div>
                    </div>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>per tip</p>
                  </div>
                );
              })}
              {/* EURC */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon icon="cryptocurrency-color:eur" style={{ fontSize: "28px" }} />
                  <div>
                    <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>0 EURC</p>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>€0.00</p>
                  </div>
                </div>
                <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>per tip</p>
              </div>
            </div>
          </div>
        </div>

        {/* Earnings over time */}
        <EarningsAreaChart
          notes={[...claimed, ...pending]}
          currency={currency}
          rateFor={rateFor}
          availableTokens={availableTokens}
        />

        {/* Recent Tips from localStorage */}
        {(filteredPending.length > 0 || filteredClaimed.length > 0) && (
          <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:clock-counter-clockwise-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>Recent Tips</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {[...filteredClaimed, ...filteredPending]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10)
                .map((note, i, arr) => (
                  <div
                    key={note.nullifierHash || note.commitment}
                    className={i < arr.length - 1 ? "border-b border-[#F5F5F5] dark:border-[#232323]" : ""}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 0",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Icon
                        icon={TOKEN_ICONS[note.token] || "ph:coin-bold"}
                        style={{ fontSize: "36px" }}
                      />
                      <div>
                        <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>{formatAmount(note)}</p>
                        <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>{formatMoney(Number(note.amount) / 1e7 * rateFor(note.token), currency)}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span
                        className={note.claimed ? "bg-[#F0FDF4] dark:bg-[#12271A] border border-[#BBF7D0] dark:border-[#1F4A2E]" : "bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]"}
                        style={{
                          fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px",
                          color: note.claimed ? "#16a34a" : "#A3A3A3",
                          WebkitTextFillColor: note.claimed ? "#16a34a" : "#A3A3A3",
                          display: "inline-block", marginBottom: "4px",
                        }}
                      >
                        {note.claimed ? "Withdrawn" : "Pending"}
                      </span>
                      <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px" }}>
                        {note.claimed && note.claimedAt
                          ? formatRelativeTime(note.claimedAt)
                          : formatRelativeTime(note.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}