"use client";

import { useMemo, useState } from "react";
import { Client, networks } from "@/lib/growthipPoolClient";

const RPC_URL = "https://soroban-testnet.stellar.org";

type ContractState = {
  currentRoot: string;
  token: string;
  tipAmount: string;
  totalDeposits: string;
  totalClaims: string;
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

export default function LiveContractReader() {
  const [state, setState] = useState<ContractState | null>(null);
  const [status, setStatus] = useState(
    "Click refresh to read GrowthipPool state from Stellar Testnet.",
  );
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => {
    return new Client({
      ...networks.testnet,
      rpcUrl: RPC_URL,
    });
  }, []);

  async function refreshState() {
    setBusy(true);
    setStatus("Reading contract state from Stellar Testnet...");

    try {
      const [rootTx, tokenTx, tipTx, depositsTx, claimsTx] = await Promise.all([
        client.current_root(),
        client.token(),
        client.tip_amount(),
        client.total_deposits(),
        client.total_claims(),
      ]);

      setState({
        currentRoot: bufferToHex(rootTx.result),
        token: String(tokenTx.result),
        tipAmount: String(tipTx.result),
        totalDeposits: String(depositsTx.result),
        totalClaims: String(claimsTx.result),
      });

      setStatus("Live contract state loaded successfully.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to read contract state.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="live-contract" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-fresh-green">
            Live Contract Reader
          </p>

          <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">
            Read GrowthipPool state directly from Stellar Testnet.
          </h2>

          <p className="mt-5 text-base leading-8 text-soft-gray/68">
            This panel uses the generated TypeScript binding for the deployed
            GrowthipPool contract. It reads the current Merkle root, configured
            token contract, fixed tip amount, total deposits, and total claims
            from testnet RPC.
          </p>

          <button
            onClick={refreshState}
            disabled={busy}
            className="mt-8 rounded-full bg-fresh-green px-6 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Reading..." : "Refresh Contract State"}
          </button>

          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
              Status
            </p>
            <p className="mt-2 text-sm leading-7 text-soft-gray/80">{status}</p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">GrowthipPool State</p>
              <p className="text-xs text-soft-gray/55">
                Contract ID: CCSYSAW...IV56
              </p>
            </div>

            <div className="rounded-full bg-neon-violet/15 px-3 py-1 text-xs font-bold text-neon-violet">
              TESTNET
            </div>
          </div>

          <div className="grid gap-3">
            <LiveInfo
              label="Current Root"
              value={state?.currentRoot || "not loaded"}
            />
            <LiveInfo label="Token" value={state?.token || "not loaded"} />
            <LiveInfo
              label="Tip Amount"
              value={state?.tipAmount || "not loaded"}
            />
            <LiveInfo
              label="Total Deposits"
              value={state?.totalDeposits || "not loaded"}
            />
            <LiveInfo
              label="Total Claims"
              value={state?.totalClaims || "not loaded"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function LiveInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-gray/40">
        {label}
      </p>
      <p className="break-all font-mono text-sm text-soft-gray/85">{value}</p>
    </div>
  );
}
