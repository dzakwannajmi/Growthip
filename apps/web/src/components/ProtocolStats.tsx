"use client";

import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import { Client, networks } from "@/lib/growthipPoolClient";

const RPC_URL = "https://soroban-testnet.stellar.org";
const STROOPS_PER_XLM = BigInt("10000000");

type ProtocolStatsState = {
  currentRoot: string;
  token: string;
  tipAmountStroops: bigint;
  tipAmountXlm: string;
  totalDeposits: number;
  totalClaims: number;
  totalDepositedXlm: string;
  totalClaimedXlm: string;
  poolBalanceXlm: string;
  claimRate: string;
};

function bufferToHex(value: Buffer | Uint8Array | unknown) {
  if (!value) return "";

  if (Buffer.isBuffer(value)) {
    return value.toString("hex");
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }

  return String(value);
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return BigInt(String(value));
}

function formatXlmFromStroops(value: bigint) {
  const whole = value / STROOPS_PER_XLM;
  const fraction = value % STROOPS_PER_XLM;

  if (fraction === BigInt(0)) {
    return `${whole.toString()} XLM`;
  }

  const fractionText = fraction.toString().padStart(7, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionText} XLM`;
}

function shortHash(value: string) {
  if (!value) return "";
  return `${value.slice(0, 10)}...${value.slice(-10)}`;
}

export default function ProtocolStats() {
  const [stats, setStats] = useState<ProtocolStatsState | null>(null);
  const [status, setStatus] = useState(
    "Refresh to load public protocol stats from GrowthipPool on Stellar Testnet.",
  );
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => {
    return new Client({
      ...networks.testnet,
      rpcUrl: RPC_URL,
    });
  }, []);

  async function refreshStats() {
    setBusy(true);
    setStatus("Loading public protocol stats from Stellar Testnet...");

    try {
      const [rootTx, tokenTx, tipTx, depositsTx, claimsTx] = await Promise.all([
        client.current_root(),
        client.token(),
        client.tip_amount(),
        client.total_deposits(),
        client.total_claims(),
      ]);

      const tipAmountStroops = toBigInt(tipTx.result);
      const totalDeposits = Number(depositsTx.result);
      const totalClaims = Number(claimsTx.result);

      const totalDepositedStroops = BigInt(totalDeposits) * tipAmountStroops;
      const totalClaimedStroops = BigInt(totalClaims) * tipAmountStroops;
      const poolBalanceStroops =
        BigInt(totalDeposits - totalClaims) * tipAmountStroops;

      const claimRate =
        totalDeposits === 0
          ? "0%"
          : `${((totalClaims / totalDeposits) * 100).toFixed(2)}%`;

      setStats({
        currentRoot: bufferToHex(rootTx.result),
        token: String(tokenTx.result),
        tipAmountStroops,
        tipAmountXlm: formatXlmFromStroops(tipAmountStroops),
        totalDeposits,
        totalClaims,
        totalDepositedXlm: formatXlmFromStroops(totalDepositedStroops),
        totalClaimedXlm: formatXlmFromStroops(totalClaimedStroops),
        poolBalanceXlm: formatXlmFromStroops(poolBalanceStroops),
        claimRate,
      });

      setStatus("Public protocol stats loaded successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load protocol stats.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="protocol-stats" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-fresh-green">
            Public Protocol Stats
          </p>

          <h2 className="max-w-3xl text-3xl font-black tracking-tight text-white md:text-5xl">
            Transparent aggregate stats without exposing supporter-to-creator links.
          </h2>

          <p className="mt-5 max-w-3xl text-base leading-8 text-soft-gray/68">
            Growthip can show protocol-level health metrics such as deposits,
            claims, pool balance, and claim rate, while still avoiding public
            donor-to-recipient relationship tracking.
          </p>
        </div>

        <button
          onClick={refreshStats}
          disabled={busy}
          className="w-fit rounded-full bg-fresh-green px-6 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Loading..." : "Refresh Stats"}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Deposits"
          value={stats ? String(stats.totalDeposits) : "not loaded"}
          description={
            stats
              ? `${stats.totalDepositedXlm} deposited into the pool`
              : "Number of successful private tip deposits."
          }
        />

        <StatCard
          label="Total Claims"
          value={stats ? String(stats.totalClaims) : "not loaded"}
          description={
            stats
              ? `${stats.totalClaimedXlm} claimed by recipients`
              : "Number of successful proof-based claims."
          }
        />

        <StatCard
          label="Pool Balance"
          value={stats?.poolBalanceXlm || "not loaded"}
          description="Estimated from deposits minus claims for the fixed 10 XLM pool."
        />

        <StatCard
          label="Tip Amount"
          value={stats?.tipAmountXlm || "not loaded"}
          description={
            stats
              ? `${stats.tipAmountStroops.toString()} stroops per private tip`
              : "Fixed denomination used by the current testnet pool."
          }
        />

        <StatCard
          label="Claim Rate"
          value={stats?.claimRate || "not loaded"}
          description="Percentage of deposited notes that have been successfully claimed."
        />

        <StatCard
          label="Token Contract"
          value={stats ? shortHash(stats.token) : "not loaded"}
          description={stats?.token || "Native XLM SAC contract on Stellar Testnet."}
        />
      </div>

      <div className="mt-4 rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
            Current Merkle Root
          </p>
          <span className="rounded-full bg-neon-violet/15 px-3 py-1 text-xs font-bold text-neon-violet">
            TESTNET
          </span>
        </div>

        <p className="break-all font-mono text-sm text-soft-gray/85">
          {stats?.currentRoot || "not loaded"}
        </p>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-midnight-blue/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
          Status
        </p>
        <p className="mt-2 text-sm leading-7 text-soft-gray/80">{status}</p>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl backdrop-blur-xl">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/40">
        {label}
      </p>
      <p className="break-all text-3xl font-black tracking-tight text-white">
        {value}
      </p>
      <p className="mt-3 text-sm leading-7 text-soft-gray/58">{description}</p>
    </div>
  );
}
