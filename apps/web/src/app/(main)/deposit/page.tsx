"use client";

import { useCallback, useEffect, useState } from "react";
import { Buffer } from "buffer";
import Link from "next/link";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";
import {
  generateSecret,
  generateNullifier,
  computeRecipientHash,
  computeCommitment,
  computeNullifierHash,
  warmPoseidon,
} from "@/lib/poseidon";
import { hexToBuffer } from "@/lib/zkp";
import { config } from "@/lib/config";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, type PrivateNote } from "@/lib/note";
import TokenSelector from "@/components/TokenSelector";
import AmountSelector from "@/components/AmountSelector";
import dynamic from "next/dynamic";

const PrivateNoteDisplay = dynamic(
  () => import("@/components/PrivateNoteDisplay"),
  { ssr: false }
);

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

type Step = "connect" | "select" | "deposit" | "note";

/** Decimal field element -> 32-byte hex string (no 0x prefix) */
function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

export default function DepositPage() {
  const [step, setStep]                     = useState<Step>("connect");
  const [address, setAddress]               = useState("");
  const [network, setNetwork]               = useState("");
  const [token, setToken]                   = useState<Token>(getAvailableTokens()[0]);
  const [contractAmount, setContractAmount] = useState<number>(0);
  const [displayAmount, setDisplayAmount]   = useState<number>(0);
  const [status, setStatus]                 = useState("");
  const [busy, setBusy]                     = useState(false);
  const [note, setNote]                     = useState<PrivateNote | null>(null);

  const isTestnet   = network.toUpperCase() === "TESTNET";
  const amountReady = contractAmount > 0;

  const [PoolClient, setPoolClient] = useState<null | {
    Client:   typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) => {
      setPoolClient({ Client: mod.Client, networks: mod.networks });
    });
  }, []);

  function handleTokenChange(t: Token) {
    setToken(t);
    setContractAmount(0);
    setDisplayAmount(0);
  }

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
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      setAddress(access.address);

      const net = await getNetwork();
      if (net.error) throw new Error(String(net.error));
      setNetwork(net.network ?? "");

      // Warm up Poseidon WASM in background
      void warmPoseidon();

      setStatus("Wallet connected.");
      setStep("select");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  const buildClient = useCallback(
    (publicKey: string) => {
      if (!PoolClient) throw new Error("Client not ready");
      const { Client, networks } = PoolClient;
      return new Client({
        ...networks.testnet,
        contractId: token.poolId,
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const signed = await freighterSign(xdr, {
            address: publicKey,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          if (signed.error) throw new Error(String(signed.error));
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      });
    },
    [PoolClient, token],
  );

  async function deposit() {
    if (!address || !isTestnet) {
      setStatus("Connect Freighter to Stellar Testnet first.");
      return;
    }
    if (!PoolClient) {
      setStatus("Client not ready, please wait...");
      return;
    }
    if (!amountReady) {
      setStatus("Please select an amount first.");
      return;
    }

    // Validate amount is valid multiple of baseUnit
    const validMultiples = [1, 5, 10, 20].map((m) => token.baseUnit * m);
    if (!validMultiples.includes(contractAmount)) {
      setStatus(`Invalid amount. Must be 1x/5x/10x/20x of base unit.`);
      return;
    }

    setBusy(true);
    setStatus("Generating secret and nullifier...");
    try {
      // 1. Generate fresh randomness
      const secret     = generateSecret();
      const nullifier  = generateNullifier();

      // 2. Derive recipientHash from connected wallet address
      setStatus("Computing recipient hash...");
      const recipientHash  = await computeRecipientHash(address);
      const commitment     = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash  = await computeNullifierHash(nullifier);

      const commitmentHex  = decimalToHex32(commitment);
      const commitmentBuf  = Buffer.from(commitmentHex, "hex");

      const client = buildClient(address);

      // 3. Auto-register recipientHash on-chain if not already registered
      setStatus("Checking recipient registration...");
      const existing = await client.get_recipient_hash({ recipient: address });
      if (existing.result == null) {
        setStatus("Registering recipient hash on-chain...");
        const recipientHashBuf = Buffer.from(decimalToHex32(recipientHash), "hex");
        const regTx = await client.register_recipient({
          recipient:      address,
          recipient_hash: recipientHashBuf,
        });
        await regTx.signAndSend({ force: true });
      }

      // 4. Submit commitment on-chain
      setStatus("Approve the deposit transaction in Freighter...");
      const tx = await client.deposit_paid({
        depositor:  address,
        commitment: commitmentBuf,
        amount:     BigInt(contractAmount),
      });

      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);

      // 5. Save private note to localStorage
      const newNote: PrivateNote = {
        version:       "growthip-v3",
        secret,
        nullifier,
        recipientHash,
        commitment:    commitmentHex,
        nullifierHash: decimalToHex32(nullifierHash),
        root:          "0".padStart(64, "0"),
        token:         token.symbol as TokenSymbol,
        amount:        String(contractAmount),
        timestamp:     Date.now(),
        depositIndex,
        claimed:       false,
      };

      saveNote(newNote);
      setNote(newNote);
      setStatus("Deposit successful.");
      setStep("note");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  const fmtDisplay = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-10 lg:px-8">
        <Link
          href="/"
          className="mb-6 flex items-center gap-2 text-sm text-soft-gray/50 hover:text-white"
        >
          Back
        </Link>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-white">
          Send a Private Tip
        </h1>
        <p className="mb-8 text-sm text-soft-gray/60">
          Deposit into the Growthip privacy pool. A ZK proof is generated in
          your browser — secret and nullifier never leave your device.
        </p>

        <div className="mb-6 rounded-3xl border border-coral-red/20 bg-coral-red/10 p-4">
          <p className="text-sm font-bold text-coral-red">Testnet Only</p>
          <p className="mt-1 text-xs text-soft-gray/70">
            This uses testnet tokens. Do not use real funds.
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

        {/* Step: Select token + amount */}
        {step === "select" && (
          <div className="space-y-4 rounded-[2rem] border border-white/10 bg-rich-black/70 p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">
                {address.slice(0, 6)}...{address.slice(-6)}
              </p>
              <span
                className={
                  "rounded-full px-3 py-1 text-xs font-bold " +
                  (isTestnet
                    ? "bg-fresh-green/10 text-fresh-green"
                    : "bg-coral-red/10 text-coral-red")
                }
              >
                {network || "unknown"}
              </span>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
                Select Token
              </p>
              <TokenSelector value={token.symbol} onChange={handleTokenChange} />
            </div>

            <AmountSelector
              key={token.symbol}
              token={token}
              onAmountChange={(ca, da) => {
                setContractAmount(ca);
                setDisplayAmount(da);
              }}
            />

            {amountReady && (
              <div className="rounded-2xl border border-fresh-green/20 bg-fresh-green/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-soft-gray/60">You will deposit</p>
                    <p className="text-xl font-black text-white">
                      {fmtDisplay(displayAmount)} {token.symbol}
                    </p>
                    <p className="mt-1 text-xs text-soft-gray/50">
                      + ~0.006 XLM network fee
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-soft-gray/60">Pool</p>
                    <p className="text-xs font-semibold text-white">
                      {token.poolId.slice(0, 6)}...{token.poolId.slice(-4)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep("deposit")}
              disabled={!isTestnet || !amountReady}
              className="w-full rounded-2xl bg-fresh-green px-5 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:opacity-50"
            >
              {amountReady
                ? `Continue — ${fmtDisplay(displayAmount)} ${token.symbol}`
                : "Select an amount to continue"}
            </button>
          </div>
        )}

        {/* Step: Confirm + deposit */}
        {step === "deposit" && (
          <div className="space-y-4 rounded-[2rem] border border-white/10 bg-rich-black/70 p-6">
            <p className="text-sm font-semibold text-white">Confirm Deposit</p>

            <div className="space-y-2">
              <InfoRow label="Token"   value={token.name} />
              <InfoRow
                label="Amount"
                value={`${fmtDisplay(displayAmount)} ${token.symbol}`}
              />
              <InfoRow
                label="Pool"
                value={`${token.poolId.slice(0, 8)}...${token.poolId.slice(-6)}`}
              />
              <InfoRow label="Network" value="Stellar Testnet" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
                Transaction Estimate
              </p>
              <div className="flex justify-between text-xs">
                <span className="text-soft-gray/60">Tip amount</span>
                <span className="font-semibold text-white">
                  {fmtDisplay(displayAmount)} {token.symbol}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-soft-gray/60">Soroban resource fee</span>
                <span className="font-semibold text-white">~0.008 XLM</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-soft-gray/60">Recipient registration (first time)</span>
                <span className="font-semibold text-white">~0.005 XLM</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-soft-gray/60">ZK commitment generation</span>
                <span className="font-semibold text-fresh-green">Browser-side (free)</span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between text-xs">
                <span className="font-semibold text-white">Total est. (first deposit)</span>
                <span className="font-black text-white">
                  {fmtDisplay(displayAmount)} {token.symbol} + ~0.014 XLM
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-soft-gray/50">Subsequent deposits</span>
                <span className="text-soft-gray/50">
                  {fmtDisplay(displayAmount)} {token.symbol} + ~0.009 XLM
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-neon-violet/20 bg-neon-violet/5 p-4">
              <p className="text-xs leading-6 text-soft-gray/70">
                A fresh <span className="font-semibold text-white">secret</span> and{" "}
                <span className="font-semibold text-white">nullifier</span> will be
                generated in your browser. After deposit, save your{" "}
                <span className="font-semibold text-white">private note</span> — it is
                the only way to claim this tip.
              </p>
            </div>

            <button
              onClick={deposit}
              disabled={busy}
              className="w-full rounded-2xl bg-fresh-green px-5 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:opacity-50"
            >
              {busy
                ? status || "Processing..."
                : `Deposit ${fmtDisplay(displayAmount)} ${token.symbol}`}
            </button>

            <button
              onClick={() => setStep("select")}
              disabled={busy}
              className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              Back
            </button>

            {status && !busy && (
              <p className="text-xs text-soft-gray/60">{status}</p>
            )}
          </div>
        )}

        {/* Step: Show private note */}
        {step === "note" && note && (
          <div className="space-y-4">
            <PrivateNoteDisplay note={note} />
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/claim"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-sm font-bold text-white"
              >
                Claim a tip
              </Link>
              <Link
                href="/dashboard"
                className="rounded-2xl bg-neon-violet px-5 py-3 text-center text-sm font-bold text-white"
              >
                Dashboard
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