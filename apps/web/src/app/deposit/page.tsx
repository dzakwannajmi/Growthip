"use client";

import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import Link from "next/link";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";
import { Client, networks } from "@/lib/growthipPoolClient";
import { config } from "@/lib/config";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, type PrivateNote } from "@/lib/note";
import TokenSelector from "@/components/TokenSelector";
import dynamic from "next/dynamic";
const PrivateNoteDisplay = dynamic(() => import("@/components/PrivateNoteDisplay"), { ssr: false });
import {
  GROWTHIP_COMMITMENT_HEX,
  GROWTHIP_PUBLIC_INPUTS_HEX,
  GROWTHIP_NULLIFIER_HASH_HEX,
  GROWTHIP_RECIPIENT_HASH_HEX,
} from "@/lib/growthipProof";

const RPC_URL          = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

type Step = "connect" | "select" | "deposit" | "note";

export default function DepositPage() {
  const [step, setStep]         = useState<Step>("connect");
  const [address, setAddress]   = useState("");
  const [network, setNetwork]   = useState("");
  const [token, setToken]       = useState<Token>(getAvailableTokens()[0]);
  const [status, setStatus]     = useState("");
  const [busy, setBusy]         = useState(false);
  const [note, setNote]         = useState<PrivateNote | null>(null);

  const isTestnet = network.toUpperCase() === "TESTNET";

  const client = useMemo(
    () =>
      new Client({
        ...networks.testnet,
        rpcUrl: RPC_URL,
        publicKey: address || undefined,
      }),
    [address],
  );

  // ── Connect wallet ──────────────────────────────────────────────
  async function connectWallet() {
    setBusy(true);
    setStatus("Connecting Freighter...");
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setStatus("Freighter not installed. Please install it first.");
        return;
      }
      await setAllowed();
      const access  = await requestAccess();
      if (access.error) throw new Error(access.error);
      setAddress(access.address);

      const net = await getNetwork();
      if (net.error) throw new Error(net.error);
      setNetwork(net.network ?? "");

      setStatus("Wallet connected.");
      setStep("select");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  // ── Deposit ─────────────────────────────────────────────────────
  async function deposit() {
    if (!address || !isTestnet) {
      setStatus("Connect Freighter to Stellar Testnet first.");
      return;
    }
    setBusy(true);
    setStatus("Preparing deposit transaction...");
    try {
      const commitment = Buffer.from(GROWTHIP_COMMITMENT_HEX, "hex");

      const tx = await client.deposit_paid({
        depositor:  address,
        commitment,
      });

      setStatus("Approve the transaction in Freighter...");

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          const signed = await freighterSign(xdr, {
            address,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          if (signed.error) throw new Error(signed.error);
          return { signedTxXdr: signed.signedTxXdr, signerAddress: signed.signerAddress };
        },
      });

      // Build and save private note
      const newNote: PrivateNote = {
        version:       "growthip-v3",
        secret:        "demo-secret",
        nullifier:     "demo-nullifier",
        recipientHash: GROWTHIP_RECIPIENT_HASH_HEX,
        commitment:    GROWTHIP_COMMITMENT_HEX,
        nullifierHash: GROWTHIP_NULLIFIER_HASH_HEX,
        root:          GROWTHIP_PUBLIC_INPUTS_HEX[0],
        token:         token.symbol as TokenSymbol,
        amount:        String(token.tipAmount),
        timestamp:     Date.now(),
        depositIndex:  0,
        claimed:       false,
      };

      saveNote(newNote);
      setNote(newNote);
      setStatus("Deposit successful.");
      setStep("note");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-10 lg:px-8">
        {/* Header */}
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm text-soft-gray/50 hover:text-white">
          ← Back
        </Link>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white">
          Send a Private Tip
        </h1>
        <p className="mb-8 text-sm text-soft-gray/60">
          Deposit into the Growthip privacy pool. The recipient claims
          using a private note — no on-chain link between you and them.
        </p>

        {/* Testnet warning */}
        <div className="mb-6 rounded-3xl border border-coral-red/20 bg-coral-red/10 p-4">
          <p className="text-sm font-bold text-coral-red">Testnet Only</p>
          <p className="mt-1 text-xs text-soft-gray/70">
            This uses testnet XLM. Do not use real funds.
          </p>
        </div>

        {/* Step: Connect */}
        {step === "connect" && (
          <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-6">
            <p className="mb-4 text-sm text-soft-gray/70">
              Connect your Freighter wallet to continue.
            </p>
            <button
              onClick={connectWallet}
              disabled={busy}
              className="w-full rounded-2xl bg-neon-violet px-5 py-3 text-sm font-black text-white transition hover:scale-[1.02] disabled:opacity-50"
            >
              {busy ? "Connecting..." : "Connect Freighter"}
            </button>
            {status && (
              <p className="mt-3 text-xs text-soft-gray/60">{status}</p>
            )}
          </div>
        )}

        {/* Step: Select token */}
        {step === "select" && (
          <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                Connected: {address.slice(0, 6)}...{address.slice(-6)}
              </p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                isTestnet ? "bg-fresh-green/10 text-fresh-green" : "bg-coral-red/10 text-coral-red"
              }`}>
                {network || "unknown"}
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
                Select Token
              </p>
              <TokenSelector
                value={token.symbol}
                onChange={setToken}
              />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-soft-gray/50">Tip amount (fixed)</p>
              <p className="mt-1 text-lg font-black text-white">
                {token.tipAmount / Math.pow(10, token.decimals)} {token.symbol}
              </p>
            </div>

            <button
              onClick={() => setStep("deposit")}
              disabled={!isTestnet}
              className="w-full rounded-2xl bg-fresh-green px-5 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:opacity-50"
            >
              Continue →
            </button>
          </div>
        )}

        {/* Step: Confirm deposit */}
        {step === "deposit" && (
          <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-6 space-y-4">
            <p className="text-sm font-semibold text-white">Confirm Deposit</p>

            <div className="space-y-2">
              <InfoRow label="Token"  value={token.name} />
              <InfoRow label="Amount" value={`${token.tipAmount / Math.pow(10, token.decimals)} ${token.symbol}`} />
              <InfoRow label="Pool"   value={`${token.poolId.slice(0, 8)}...${token.poolId.slice(-6)}`} />
              <InfoRow label="Network" value="Stellar Testnet" />
            </div>

            <button
              onClick={deposit}
              disabled={busy}
              className="w-full rounded-2xl bg-fresh-green px-5 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:opacity-50"
            >
              {busy ? "Processing..." : `Deposit ${token.tipAmount / Math.pow(10, token.decimals)} ${token.symbol}`}
            </button>

            <button
              onClick={() => setStep("select")}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white"
            >
              ← Back
            </button>

            {status && (
              <p className="text-xs text-soft-gray/60">{status}</p>
            )}
          </div>
        )}

        {/* Step: Show note */}
        {step === "note" && note && (
          <div className="space-y-4">
            <PrivateNoteDisplay note={note} />
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/claim"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-sm font-bold text-white"
              >
                Claim a tip →
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl bg-neon-violet px-5 py-3 text-center text-sm font-bold text-white"
              >
                Dashboard →
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <span className="text-xs text-soft-gray/50">{label}</span>
      <span className="text-xs font-semibold text-white">{value}</span>
    </div>
  );
}
