"use client";

import { useEffect, useState, useCallback } from "react";
import { config } from "@/lib/config";
import { SUPPORTED_TOKENS } from "@/lib/tokens";

interface PoolStats {
  totalDeposits: number;
  totalClaims:   number;
  claimRate:     number;
  tipAmount:     string;
  token:         string;
}

const RPC_URL = config.network.rpcUrl;

async function fetchPoolStats(poolId: string, tokenSymbol: string): Promise<PoolStats> {
  const { Client, networks } = await import("@/lib/growthipPoolClient");
  const client = new Client({
    ...networks.testnet,
    contractId: poolId,
    rpcUrl:     RPC_URL,
  });

  const [tipTx, depositsTx, claimsTx] = await Promise.all([
    client.tip_amount(),
    client.total_deposits(),
    client.total_claims(),
  ]);

  const deposits = Number(depositsTx.result ?? 0);
  const claims   = Number(claimsTx.result ?? 0);
  const tipAmt   = Number(tipTx.result ?? 0);
  const human    = (tipAmt / Math.pow(10, 7)).toFixed(tokenSymbol === "XLM" ? 0 : 1);

  return {
    totalDeposits: deposits,
    totalClaims:   claims,
    claimRate:     deposits > 0 ? Math.round((claims / deposits) * 100) : 0,
    tipAmount:     `${human} ${tokenSymbol} base`,
    token:         tokenSymbol,
  };
}

function StatCard({ label, value, sub, valueColor }: {
  label: string; value: string; sub: string; valueColor?: string;
}) {
  return (
    <div style={{ borderRadius: "16px", border: "1px solid #E5E5E5", background: "white", padding: "20px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>
        {label}
      </p>
      <p style={{ fontSize: "24px", fontWeight: 800, color: valueColor || "#0A0A0A" }}>{value}</p>
      <p style={{ fontSize: "12px", color: "#A3A3A3", marginTop: "4px" }}>{sub}</p>
    </div>
  );
}

export default function DashboardStats() {
  const [stats, setStats]           = useState<Record<string, PoolStats>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const availableTokens = SUPPORTED_TOKENS.filter((t) => t.available);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        availableTokens.map((t) => fetchPoolStats(t.poolId, t.symbol))
      );
      const map: Record<string, PoolStats> = {};
      availableTokens.forEach((t, i) => { map[t.symbol] = results[i]; });
      setStats(map);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading && Object.keys(stats).length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(4, 1fr)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ height: "96px", borderRadius: "16px", background: "#F5F5F5" }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2", padding: "16px", fontSize: "14px", color: "#EF4444" }}>
        {error}
        <button onClick={refresh} style={{ marginLeft: "12px", textDecoration: "underline", background: "none", border: "none", color: "#EF4444", cursor: "pointer" }}>
          Retry
        </button>
      </div>
    );
  }

  const allStats      = Object.values(stats);
  const totalDeposits = allStats.reduce((s, p) => s + p.totalDeposits, 0);
  const totalClaims   = allStats.reduce((s, p) => s + p.totalClaims, 0);
  const claimRate     = totalDeposits > 0 ? Math.round((totalClaims / totalDeposits) * 100) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Aggregate stats */}
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, 1fr)", gridAutoRows: "1fr" }}
        className="md:grid-cols-4">
        <StatCard label="Total Deposits"  value={String(totalDeposits)} sub="anonymous tips sent"      valueColor="#6366f1" />
        <StatCard label="Total Claims"    value={String(totalClaims)}   sub="tips claimed"             valueColor="#22c55e" />
        <StatCard label="Unclaimed Tips"  value={String(totalDeposits - totalClaims)} sub="waiting to be claimed" valueColor="#0A0A0A" />
        <StatCard label="Claim Rate"      value={`${claimRate}%`}       sub="of tips claimed"          valueColor={claimRate > 50 ? "#22c55e" : "#6366f1"} />
      </div>

      {/* Per-token breakdown */}
      {availableTokens.length > 1 && (
        <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(2, 1fr)" }}>
          {availableTokens.map((token) => {
            const s = stats[token.symbol];
            if (!s) return null;
            return (
              <div key={token.symbol} style={{ borderRadius: "16px", border: "1px solid #E5E5E5", background: "white", padding: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{token.symbol} Pool</p>
                  <span style={{ borderRadius: "999px", background: "#EEF2FF", padding: "4px 12px", fontSize: "12px", fontWeight: 600, color: "#6366f1" }}>
                    {s.tipAmount}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", textAlign: "center" }}>
                  <div>
                    <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A" }}>{s.totalDeposits}</p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3" }}>deposits</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "18px", fontWeight: 800, color: "#22c55e" }}>{s.totalClaims}</p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3" }}>claims</p>
                  </div>
                  <div>
                    <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A" }}>{s.claimRate}%</p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3" }}>claimed</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Last updated + refresh */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: "12px", color: "#A3A3A3" }}>
          {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading..."}
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          style={{
            borderRadius: "999px", border: "1px solid #E5E5E5",
            padding: "4px 12px", fontSize: "12px", color: "#525252",
            background: "white", cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}