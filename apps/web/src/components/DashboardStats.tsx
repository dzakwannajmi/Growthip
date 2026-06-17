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

  // Convert tip amount to human readable
  const human = (tipAmt / Math.pow(10, 7)).toFixed(
    tokenSymbol === "XLM" ? 0 : 1
  );

  return {
    totalDeposits: deposits,
    totalClaims:   claims,
    claimRate:     deposits > 0 ? Math.round((claims / deposits) * 100) : 0,
    tipAmount:     `${human} ${tokenSymbol} base`,
    token:         tokenSymbol,
  };
}

export default function DashboardStats() {
  const [stats, setStats]     = useState<Record<string, PoolStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
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

  // Initial fetch
  useEffect(() => { refresh(); }, [refresh]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  if (loading && Object.keys(stats).length === 0) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-coral-red/20 bg-coral-red/10 p-4 text-sm text-coral-red">
        {error}
        <button onClick={refresh} className="ml-3 underline">Retry</button>
      </div>
    );
  }

  // Aggregate totals across all pools
  const allStats = Object.values(stats);
  const totalDeposits = allStats.reduce((s, p) => s + p.totalDeposits, 0);
  const totalClaims   = allStats.reduce((s, p) => s + p.totalClaims, 0);
  const claimRate     = totalDeposits > 0
    ? Math.round((totalClaims / totalDeposits) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* Aggregate stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Deposits"
          value={String(totalDeposits)}
          sub="anonymous tips sent"
          color="text-neon-violet"
        />
        <StatCard
          label="Total Claims"
          value={String(totalClaims)}
          sub="tips claimed"
          color="text-fresh-green"
        />
        <StatCard
          label="Unclaimed Tips"
          value={String(totalDeposits - totalClaims)}
          sub="waiting to be claimed"
          color="text-white"
        />
        <StatCard
          label="Claim Rate"
          value={`${claimRate}%`}
          sub="of tips claimed"
          color={claimRate > 50 ? "text-fresh-green" : "text-neon-violet"}
        />
      </div>

      {/* Per-token breakdown */}
      {availableTokens.length > 1 && (
        <div className="grid gap-3 md:grid-cols-2">
          {availableTokens.map((token) => {
            const s = stats[token.symbol];
            if (!s) return null;
            return (
              <div
                key={token.symbol}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-bold text-white">{token.symbol} Pool</p>
                  <span className="rounded-full bg-neon-violet/10 px-3 py-1 text-xs font-semibold text-neon-violet">
                    {s.tipAmount}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-black text-white">{s.totalDeposits}</p>
                    <p className="text-xs text-soft-gray/50">deposits</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-fresh-green">{s.totalClaims}</p>
                    <p className="text-xs text-soft-gray/50">claims</p>
                  </div>
                  <div>
                    <p className="text-lg font-black text-white">{s.claimRate}%</p>
                    <p className="text-xs text-soft-gray/50">claimed</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Last updated + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-soft-gray/40">
          {lastUpdated
            ? `Updated ${lastUpdated.toLocaleTimeString()}`
            : "Loading..."}
        </p>
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-full border border-white/10 px-3 py-1 text-xs text-soft-gray/60 transition hover:text-white disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label, value, sub, color,
}: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
        {label}
      </p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="mt-1 text-xs text-soft-gray/50">{sub}</p>
    </div>
  );
}
