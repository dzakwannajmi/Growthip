"use client";

import { useCallback, useEffect, useState } from "react";
import { Buffer } from "buffer";
import Link from "next/link";
import { Icon } from "@iconify/react";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
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

function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

// Light theme card wrapper
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "24px", ...style }}>
      {children}
    </div>
  );
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
    setStatus("Connecting wallet...");
    try {
      const { connectWalletModal } = await import("@/lib/wallet");
      const addr = await connectWalletModal();
      setAddress(addr);
      setNetwork("TESTNET");
      localStorage.setItem("growthip:wallet", addr);
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
    (publicKey: string, tokenSymbol: string = "XLM") => {
      if (!PoolClient) throw new Error("Client not ready");
      const { Client, networks } = PoolClient;
      const poolId = tokenSymbol === "USDC"
        ? (process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId)
        : networks.testnet.contractId;
      return new Client({
        ...networks.testnet,
        contractId: poolId,
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const { signTransaction: walletSign } = await import("@/lib/wallet");
          const signed = await walletSign(xdr, { address: publicKey, networkPassphrase: NETWORK_PASSPHRASE });
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      });
    },
    [PoolClient, token],
  );

  async function deposit() {
    if (!address || !isTestnet || !PoolClient || !amountReady) return;
    setBusy(true);
    setStatus("Generating secret and nullifier...");
    try {
      const secret        = generateSecret();
      const nullifier     = generateNullifier();
      setStatus("Computing recipient hash...");
      const recipientHash = await computeRecipientHash(address);
      const commitment    = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash = await computeNullifierHash(nullifier);
      const commitmentHex = decimalToHex32(commitment);
      const commitmentBuf = Buffer.from(commitmentHex, "hex");
      const client        = buildClient(address, token.symbol);
      setStatus("Checking recipient registration...");
      const existing = await client.get_recipient_hash({ recipient: address });
      if (existing.result == null) {
        setStatus("Registering recipient hash...");
        const recipientHashBuf = Buffer.from(decimalToHex32(recipientHash), "hex");
        const regTx = await client.register_recipient({ recipient: address, recipient_hash: recipientHashBuf });
        await regTx.signAndSend({ force: true });
      }
      setStatus("Approve the deposit transaction in Freighter...");
      const tx = await client.deposit_paid({ depositor: address, commitment: commitmentBuf, amount: BigInt(contractAmount), message: undefined });
      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);
      const newNote: PrivateNote = {
        version: "growthip-v3", secret, nullifier, recipientHash,
        commitment: commitmentHex, nullifierHash: decimalToHex32(nullifierHash),
        root: "0".padStart(64, "0"), token: token.symbol as TokenSymbol,
        amount: String(contractAmount), timestamp: Date.now(), depositIndex, claimed: false,
      };
      saveNote(address, newNote);
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
    <div className="p-4 md:p-8 lg:p-10 w-full" style={{ background: "#FAFAFA" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "16px" }}>

        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Send a Private Tip</h1>
          <p style={{ fontSize: "14px", color: "#737373", marginTop: "4px" }}>
            Deposit into the Growthip privacy pool. ZK proof generated in your browser.
          </p>
        </div>

        {/* Testnet notice */}
        <div style={{ borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2", padding: "12px 16px" }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#EF4444" }}>Testnet Only</p>
          <p style={{ fontSize: "12px", color: "#737373", marginTop: "2px" }}>This uses testnet tokens. Do not use real funds.</p>
        </div>

        {/* Step: Connect */}
        {step === "connect" && (
          <Card>
            <p style={{ fontSize: "14px", color: "#737373", marginBottom: "16px" }}>
              Connect your Freighter wallet to continue.
            </p>
            <button
              onClick={connectWallet}
              disabled={busy}
              style={{
                width: "100%", padding: "12px", borderRadius: "12px",
                background: "#0A0A0A", color: "white", fontSize: "14px",
                fontWeight: 700, border: "none", cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1, transition: "opacity 0.2s",
              }}
            >
              {busy ? "Connecting..." : "Connect Freighter"}
            </button>
            {status && <p style={{ fontSize: "12px", color: "#737373", marginTop: "12px" }}>{status}</p>}
          </Card>
        )}

        {/* Step: Select */}
        {step === "select" && (
          <Card>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <p style={{ fontFamily: "monospace", fontSize: "12px", color: "#737373" }}>
                {address.slice(0, 8)}...{address.slice(-6)}
              </p>
              <span style={{
                fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px",
                background: isTestnet ? "#F0FDF4" : "#FEF2F2",
                color: isTestnet ? "#22c55e" : "#EF4444",
              }}>
                {network || "unknown"}
              </span>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>
                Select Token
              </p>
              <TokenSelector value={token.symbol} onChange={handleTokenChange} />
            </div>

            <AmountSelector
              key={token.symbol}
              token={token}
              onAmountChange={(ca, da) => { setContractAmount(ca); setDisplayAmount(da); }}
            />

            {amountReady && (
              <div style={{ marginTop: "16px", padding: "16px", borderRadius: "12px", border: "1px solid #D1FAE5", background: "#F0FDF4" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <p style={{ fontSize: "12px", color: "#737373" }}>You will deposit</p>
                    <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>
                      {fmtDisplay(displayAmount)} {token.symbol}
                    </p>
                    <p style={{ fontSize: "11px", color: "#A3A3A3", marginTop: "2px" }}>+ ~0.008 XLM network fee</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: "11px", color: "#A3A3A3" }}>Pool</p>
                    <p style={{ fontSize: "11px", fontWeight: 600, color: "#525252", fontFamily: "monospace" }}>
                      {token.poolId.slice(0, 6)}...{token.poolId.slice(-4)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={() => setStep("deposit")}
              disabled={!isTestnet || !amountReady}
              style={{
                width: "100%", marginTop: "16px", padding: "12px", borderRadius: "12px",
                background: amountReady ? "#0A0A0A" : "#E5E5E5",
                color: amountReady ? "white" : "#A3A3A3",
                fontSize: "14px", fontWeight: 700, border: "none",
                cursor: amountReady ? "pointer" : "not-allowed",
              }}
            >
              {amountReady ? `Continue — ${fmtDisplay(displayAmount)} ${token.symbol}` : "Select an amount to continue"}
            </button>
          </Card>
        )}

        {/* Step: Confirm */}
        {step === "deposit" && (
          <Card>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A", marginBottom: "16px" }}>Confirm Deposit</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {[
                ["Token", token.name],
                ["Amount", `${fmtDisplay(displayAmount)} ${token.symbol}`],
                ["Pool", `${token.poolId.slice(0, 8)}...${token.poolId.slice(-6)}`],
                ["Network", "Stellar Testnet"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                  <span style={{ fontSize: "13px", color: "#A3A3A3" }}>{label}</span>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A" }}>{value}</span>
                </div>
              ))}
            </div>

            <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", marginBottom: "16px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>
                Fee Estimate
              </p>
              {[
                ["Soroban resource fee", "~0.008 XLM"],
                ["Recipient registration (first time)", "~0.005 XLM"],
                ["ZK commitment generation", "Browser-side (free)"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                  <span style={{ fontSize: "12px", color: "#737373" }}>{label}</span>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#0A0A0A" }}>{value}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid #E5E5E5", paddingTop: "8px", marginTop: "8px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>Total est. (first deposit)</span>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#0A0A0A" }}>{fmtDisplay(displayAmount)} {token.symbol} + ~0.014 XLM</span>
              </div>
            </div>

            <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF", marginBottom: "16px" }}>
              <p style={{ fontSize: "13px", color: "#525252", lineHeight: "1.6" }}>
                A fresh <strong style={{ color: "#0A0A0A" }}>secret</strong> and <strong style={{ color: "#0A0A0A" }}>nullifier</strong> will be generated in your browser. After deposit, save your <strong style={{ color: "#0A0A0A" }}>private note</strong> — it is the only way to claim this tip.
              </p>
            </div>

            <button
              onClick={deposit}
              disabled={busy}
              style={{
                width: "100%", padding: "14px", borderRadius: "12px",
                background: "#0A0A0A", color: "white", fontSize: "14px",
                fontWeight: 700, border: "none", cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? (status || "Processing...") : `Deposit ${fmtDisplay(displayAmount)} ${token.symbol}`}
            </button>

            <button
              onClick={() => setStep("select")}
              disabled={busy}
              style={{
                width: "100%", marginTop: "8px", padding: "12px", borderRadius: "12px",
                background: "transparent", color: "#525252", fontSize: "14px",
                fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer",
              }}
            >
              Back
            </button>

            {status && !busy && <p style={{ fontSize: "12px", color: "#737373", marginTop: "12px" }}>{status}</p>}
          </Card>
        )}

        {/* Step: Note */}
        {step === "note" && note && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PrivateNoteDisplay note={note} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <Link
                href="/dashboard/claim"
                style={{
                  display: "block", textAlign: "center", padding: "12px", borderRadius: "12px",
                  border: "1px solid #E5E5E5", color: "#0A0A0A", fontSize: "14px",
                  fontWeight: 700, textDecoration: "none",
                }}
              >
                Claim a tip
              </Link>
              <Link
                href="/dashboard"
                style={{
                  display: "block", textAlign: "center", padding: "12px", borderRadius: "12px",
                  background: "#0A0A0A", color: "white", fontSize: "14px",
                  fontWeight: 700, textDecoration: "none",
                }}
              >
                Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}