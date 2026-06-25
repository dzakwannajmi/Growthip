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

async function fetchXlmPrice(): Promise<number> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd");
    const data = await res.json();
    return data?.stellar?.usd ?? 0;
  } catch { return 0; }
}

export default function AnalyticsPage() {

  const [stats, setStats]     = useState<Record<string, PoolStats>>({});
  const [loading, setLoading] = useState(true);
  const [xlmPrice, setXlmPrice] = useState(0);
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);

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
    fetchXlmPrice().then(setXlmPrice);
  }, []);
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
  const totalDeposits = allStats.reduce((s, p) => s + p.totalDeposits, 0);
  const totalClaims   = allStats.reduce((s, p) => s + p.totalClaims, 0);
  const totalPending  = totalDeposits - totalClaims;



  // Summary cards
  const summaryCards = [
    {
      label: "Total Received",
      value: `${totalDeposits} tips`,
      sub: "Across all tokens",
      icon: "ph:arrow-down-left-bold",
      iconColor: "#22c55e",
      iconBg: "#F0FDF4",
    },
    {
      label: "Total Withdrawn",
      value: `${totalClaims} tips`,
      sub: "Transferred to wallet",
      icon: "ph:arrow-up-right-bold",
      iconColor: "#6366f1",
      iconBg: "#EEF2FF",
    },
    {
      label: "Total Tips",
      value: String(totalDeposits),
      sub: "All time contributions",
      icon: "ph:gift-bold",
      iconColor: "#f59e0b",
      iconBg: "#FFFBEB",
    },
    {
      label: "Pending Claims",
      value: String(totalPending),
      sub: "Waiting to be claimed",
      icon: "ph:clock-bold",
      iconColor: "#ef4444",
      iconBg: "#FEF2F2",
    },
  ];

  // Not connected gate — show immediately without waiting for premium check
  if (!address) {
    return (
      <div style={{ padding: "32px", background: "#FAFAFA", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "360px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon icon="ph:wallet-bold" style={{ fontSize: "32px", color: "#A3A3A3" }} />
          </div>
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#171717" }}>Connect your wallet first</p>
          <p style={{ fontSize: "13px", color: "#737373", lineHeight: 1.6 }}>
            To see your analytics, you need to connect your Stellar wallet. It's like logging in — just one click and your earnings data will appear here.
          </p>
          
          <a
            href="/dashboard"
            style={{ marginTop: "8px", padding: "10px 20px", borderRadius: "10px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}
          >
            <Icon icon="ph:arrow-left-bold" style={{ fontSize: "14px" }} />
            Go to Dashboard to Connect
          </a>
        </div>
      </div>
    );
  }

  // Premium gate: Analytics is locked behind growthip-creator-registry's
  // is_premium(), the same activation flow as private notes.
  if (premiumChecked && !isPremium) {
    return (
      <div style={{ padding: "32px", background: "#FAFAFA", minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: "360px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Icon icon="ph:chart-line-up-bold" style={{ fontSize: "36px", color: "#A3A3A3" }} />
          <p style={{ fontSize: "16px", fontWeight: 700, color: "#171717" }}>Analytics is a Premium feature</p>
          <p style={{ fontSize: "13px", color: "#737373", lineHeight: 1.6 }}>
            Activate private notes (one-time 6 XLM) in Settings to unlock detailed analytics, alongside encrypted notes from supporters.
          </p>
          <a
            href="/dashboard/settings"
            style={{ marginTop: "8px", padding: "10px 20px", borderRadius: "10px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", background: "#FAFAFA" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Icon icon="ph:chart-line-up-bold" style={{ fontSize: "24px", color: "#f59e0b" }} />
          <div>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Analytics</h1>
            <p style={{ fontSize: "14px", color: "#737373" }}>Detailed insights into your earnings</p>
          </div>
        </div>



        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "16px" }}>
          {summaryCards.map((card) => (
            <div key={card.label} style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                <p style={{ fontSize: "13px", color: "#737373", fontWeight: 500 }}>{card.label}</p>
                <div style={{ width: 32, height: 32, borderRadius: "8px", background: card.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon={card.icon} style={{ fontSize: "16px", color: card.iconColor }} />
                </div>
              </div>
              <p style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>{loading ? "—" : card.value}</p>
              <p style={{ fontSize: "12px", color: "#A3A3A3", marginTop: "4px" }}>{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Pool breakdown + Average Tip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>

          {/* Received by Token */}
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:coins-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>Received by Token</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableTokens.map((token) => {
                const tokenNotes = [...claimed, ...pending].filter((n) => n.token === token.symbol);
                const totalReceived = tokenNotes.reduce((sum, n) => sum + Number(n.amount) / 1e7, 0);
                const tipCount = tokenNotes.length;
                return (
                  <div key={token.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "28px" }} />
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{totalReceived % 1 === 0 ? totalReceived.toFixed(0) : totalReceived.toFixed(1)} {token.symbol}</p>
                        <p style={{ fontSize: "12px", color: "#A3A3A3" }}>{token.symbol === "XLM" && xlmPrice > 0 ? `$${(totalReceived * xlmPrice).toFixed(2)}` : token.symbol === "USDC" ? `$${totalReceived.toFixed(2)}` : "$0.00"}</p>
                      </div>
                    </div>
                    <p style={{ fontSize: "12px", color: "#A3A3A3" }}>{`${tipCount} tips`}</p>
                  </div>
                );
              })}
              {/* EURC coming soon */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon icon="cryptocurrency-color:eur" style={{ fontSize: "28px" }} />
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>0 EURC</p>
                    <p style={{ fontSize: "12px", color: "#A3A3A3" }}>€0.00</p>
                  </div>
                </div>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#A3A3A3" }}>Soon</span>
              </div>
            </div>
          </div>

          {/* Average Tip Amount */}
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:trend-up-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>Average Tip Amount</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableTokens.map((token) => {
                const tokenNotes = [...claimed, ...pending].filter((n) => n.token === token.symbol);
                const avgAmount = tokenNotes.length > 0
                  ? tokenNotes.reduce((sum, n) => sum + Number(n.amount) / 1e7, 0) / tokenNotes.length
                  : 0;
                const avgHuman = avgAmount % 1 === 0 ? avgAmount.toFixed(0) : avgAmount.toFixed(1);
                return (
                  <div key={token.symbol} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "28px" }} />
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{tokenNotes.length > 0 ? avgHuman : "—"} {token.symbol}</p>
                        <p style={{ fontSize: "12px", color: "#A3A3A3" }}>{token.symbol === "XLM" && xlmPrice > 0 ? `$${(avgAmount * xlmPrice).toFixed(2)}` : token.symbol === "USDC" ? `$${avgAmount.toFixed(2)}` : "$0.00"}</p>
                      </div>
                    </div>
                    <p style={{ fontSize: "12px", color: "#A3A3A3" }}>per tip</p>
                  </div>
                );
              })}
              {/* EURC */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon icon="cryptocurrency-color:eur" style={{ fontSize: "28px" }} />
                  <div>
                    <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>0 EURC</p>
                    <p style={{ fontSize: "12px", color: "#A3A3A3" }}>€0.00</p>
                  </div>
                </div>
                <p style={{ fontSize: "12px", color: "#A3A3A3" }}>per tip</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Tips from localStorage */}
        {(pending.length > 0 || claimed.length > 0) && (
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
              <Icon icon="ph:clock-counter-clockwise-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>Recent Tips</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
              {[...claimed, ...pending]
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10)
                .map((note, i, arr) => (
                  <div
                    key={note.nullifierHash || note.commitment}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid #F5F5F5" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Icon
                        icon={TOKEN_ICONS[note.token] || "ph:coin-bold"}
                        style={{ fontSize: "28px" }}
                      />
                      <div>
                        <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{formatAmount(note)}</p>
                        <p style={{ fontSize: "12px", color: "#A3A3A3" }}>{note.token === "XLM" && xlmPrice > 0 ? `$${(Number(note.amount) / 1e7 * xlmPrice).toFixed(2)}` : note.token === "USDC" ? `$${(Number(note.amount) / 1e7).toFixed(2)}` : "$0.00"}</p>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{
                        fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px",
                        background: note.claimed ? "#F0FDF4" : "#FAFAFA",
                        color: note.claimed ? "#22c55e" : "#A3A3A3",
                        border: `1px solid ${note.claimed ? "#BBF7D0" : "#E5E5E5"}`,
                        display: "inline-block", marginBottom: "4px",
                      }}>
                        {note.claimed ? "Withdrawn" : "Pending"}
                      </span>
                      <p style={{ fontSize: "11px", color: "#A3A3A3" }}>
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

        {/* Pool Stats detail */}
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon icon="ph:chart-bar-bold" style={{ fontSize: "18px", color: "#6366f1" }} />
              <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>Pool Statistics</p>
            </div>
            <button
              onClick={refresh}
              disabled={loading}
              style={{ fontSize: "12px", color: "#737373", background: "#F5F5F5", border: "1px solid #E5E5E5", borderRadius: "8px", padding: "4px 12px", cursor: "pointer" }}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {availableTokens.map((token) => {
              const s = stats[token.symbol];
              const tipHuman = s ? (s.tipAmount / Math.pow(10, 7)).toFixed(token.symbol === "XLM" ? 0 : 1) : "0";
              return (
                <div key={token.symbol} style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Icon icon={TOKEN_ICONS[token.symbol]} style={{ fontSize: "20px" }} />
                      <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{token.symbol} Pool</p>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", background: "#EEF2FF", color: "#6366f1" }}>
                      {tipHuman} {token.symbol} base
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", textAlign: "center", gap: "8px" }}>
                    <div>
                      <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>{loading ? "—" : s?.totalDeposits ?? 0}</p>
                      <p style={{ fontSize: "11px", color: "#A3A3A3" }}>deposits</p>
                    </div>
                    <div>
                      <p style={{ fontSize: "20px", fontWeight: 800, color: "#22c55e" }}>{loading ? "—" : s?.totalClaims ?? 0}</p>
                      <p style={{ fontSize: "11px", color: "#A3A3A3" }}>claims</p>
                    </div>
                    <div>
                      <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>
                        {loading ? "—" : s ? Math.round((s.totalClaims / Math.max(s.totalDeposits, 1)) * 100) : 0}%
                      </p>
                      <p style={{ fontSize: "11px", color: "#A3A3A3" }}>claimed</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}