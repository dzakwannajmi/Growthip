"use client";

import { useEffect, useMemo, useState } from "react";
import { Client, networks } from "@/lib/growthipPoolClient";
import { config } from "@/lib/config";

interface PoolStats {
  currentRoot:   string;
  tipAmount:     string;
  totalDeposits: number;
  totalClaims:   number;
  poolBalance:   string;
  claimRate:     number;
}

const RPC_URL = config.network.rpcUrl;

function bufferToHex(value: unknown): string {
  if (!value) return "";
  if (Buffer.isBuffer(value as Buffer)) return (value as Buffer).toString("hex");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return String(value);
}

export default function DashboardStats() {
  const [stats, setStats]   = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState("");

  const client = useMemo(
    () => new Client({ ...networks.testnet, rpcUrl: RPC_URL }),
    [],
  );

  useEffect(() => {
    async function fetchStats() {
      try {
        const [rootTx, tipTx, depositsTx, claimsTx] = await Promise.all([
          client.current_root(),
          client.tip_amount(),
          client.total_deposits(),
          client.total_claims(),
        ]);

        const deposits = Number(depositsTx.result ?? 0);
        const claims   = Number(claimsTx.result ?? 0);

        setStats({
          currentRoot:   bufferToHex(rootTx.result),
          tipAmount:     String(tipTx.result ?? 0),
          totalDeposits: deposits,
          totalClaims:   claims,
          poolBalance:   String((deposits - claims) * 10),
          claimRate:     deposits > 0 ? Math.round((claims / deposits) * 100) : 0,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stats");
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [client]);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-3xl bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-coral-red/20 bg-coral-red/10 p-4 text-sm text-coral-red">
        {error}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total Deposits"
        value={String(stats.totalDeposits)}
        sub="anonymous tips sent"
        color="text-neon-violet"
      />
      <StatCard
        label="Total Claims"
        value={String(stats.totalClaims)}
        sub="tips claimed"
        color="text-fresh-green"
      />
      <StatCard
        label="Pool Balance"
        value={`${stats.poolBalance} XLM`}
        sub="unclaimed tips"
        color="text-white"
      />
      <StatCard
        label="Claim Rate"
        value={`${stats.claimRate}%`}
        sub="of tips claimed"
        color="text-fresh-green"
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub:   string;
  color: string;
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
