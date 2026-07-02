"use client";
import WalletModal from "@/components/WalletModal";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Buffer } from "buffer";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";
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
import { config } from "@/lib/config";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, type PrivateNote } from "@/lib/note";
import { decodeTipId } from "@/lib/addressId";
import { getProfile, avatarUrlFor } from "@/lib/profile";
import { useRegistryClient } from "@/lib/registryClient";
import { encryptNoteForRecipient } from "@/lib/encryption/keyManagement";
import TokenSelector from "@/components/TokenSelector";
import AmountSelector from "@/components/AmountSelector";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;
const MAX_MESSAGE_LEN    = 50;

type Step = "select" | "confirm" | "done";

function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "24px", ...style }}>
      {children}
    </div>
  );
}

export default function PublicTipPage() {
  const params = useParams();
  const tipId  = typeof params.id === "string" ? params.id : "";

  const [recipientAddress, setRecipientAddress] = useState<string | null>(null);
  const [creatorDisplayName, setCreatorDisplayName] = useState("");
  const [creatorAvatarVariant, setCreatorAvatarVariant] = useState("");
  const [linkError, setLinkError] = useState("");

  // Premium / encryption gating -- private notes are mandatory: a
  // supporter cannot tip a creator who hasn't activated private notes.
  const { isReady: registryReady, buildRegistryClient } = useRegistryClient();
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [creatorIsPremium, setCreatorIsPremium] = useState(false);
  const [creatorEncryptionPubKey, setCreatorEncryptionPubKey] = useState<Uint8Array | null>(null);

  // Wallet
  const [address, setAddress]     = useState("");
  const [network, setNetwork]     = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");
  const isTestnet = network.toUpperCase() === "TESTNET";

  // Send flow
  const [step, setStep]                     = useState<Step>("select");
  const [token, setToken]                   = useState<Token>(getAvailableTokens()[0]);
  const [contractAmount, setContractAmount] = useState(0);
  const [displayAmount, setDisplayAmount]   = useState(0);
  const [simFee, setSimFee]                 = useState<number | null>(null);
  const [simFeeLoading, setSimFeeLoading]   = useState(false);
  const [poolTipAmount, setPoolTipAmount]   = useState<number | null>(null);
  const [message, setMessage]               = useState("");
  const [busy, setBusy]                     = useState(false);
  const [status, setStatus]                 = useState("");
  const [sentNote, setSentNote]             = useState<PrivateNote | null>(null);
  const [encryptedNoteBundle, setEncryptedNoteBundle] = useState<string | null>(null);
  const [copiedNote, setCopiedNote]         = useState(false);
  const [showQR, setShowQR]                 = useState(false);

  const [PoolClient, setPoolClient] = useState<null | {
    Client:   typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) =>
      setPoolClient({ Client: mod.Client, networks: mod.networks })
    );
  }, []);
  // Fetch simulated network fee from Stellar RPC fee stats.
  async function fetchNetworkFee() {
    setSimFeeLoading(true);
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getFeeStats", params: {} }),
      });
      const data = await res.json();
      const p90 = data?.result?.sorobanInclusionFee?.p90;
      if (p90) setSimFee(Math.ceil(Number(p90)) / 1e7);
    } catch { /* silent fail */ }
    finally { setSimFeeLoading(false); }
  }

  // Fetch tip_amount from contract so AmountSelector is locked to valid amount.
  useEffect(() => {
    if (!PoolClient || !token) return;
    (async () => {
      try {
        const { Client, networks } = PoolClient;
        const poolId = token.symbol === "USDC"
          ? (process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId)
          : networks.testnet.contractId;
        const client = new Client({ ...networks.testnet, contractId: poolId, rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org" });
        const tx = await client.tip_amount();
        const amount = Number(tx.result ?? 0);
        setPoolTipAmount(amount);
      } catch (e) {
        console.error("Failed to fetch tip_amount:", e);
      }
    })();
  }, [PoolClient, token]);

  // Decode the tip ID into a real Stellar address on mount.
  useEffect(() => {
    if (!tipId) return;
    try {
      const decoded = decodeTipId(tipId);
      setRecipientAddress(decoded);
      const p = getProfile(decoded);
      setCreatorDisplayName(p.displayName);
      setCreatorAvatarVariant(p.avatarVariant);
    } catch {
      setLinkError("This tip link is invalid or corrupted.");
    }
  }, [tipId]);

  // Once we know the creator's real address, check whether they've
  // activated premium (mandatory for private notes -- see Tahap 3
  // design decision: no plaintext fallback).
  useEffect(() => {
    if (!recipientAddress || !registryReady) return;
    (async () => {
      try {
        const client = buildRegistryClient(recipientAddress);
        const [premiumResult, pubkeyResult] = await Promise.all([
          client.is_premium({ recipient: recipientAddress }),
          client.get_encryption_pubkey({ recipient: recipientAddress }),
        ]);
        setCreatorIsPremium(premiumResult.result === true);
        if (pubkeyResult.result) {
          setCreatorEncryptionPubKey(new Uint8Array(pubkeyResult.result));
        }
      } catch (err) {
        console.error("Failed to check creator premium status:", err);
        setCreatorIsPremium(false);
      } finally {
        setPremiumChecked(true);
      }
    })();
  }, [recipientAddress, registryReady, buildRegistryClient]);

  async function connectWallet() {
    setWalletBusy(true);
    setWalletStatus("Connecting...");
    try {
      setShowWalletModal(true);
      return;
    } catch (err) {
      setWalletStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      setWalletBusy(false);
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
    [PoolClient],
  );

  async function handleDeposit() {
    if (!address || !isTestnet || !PoolClient || contractAmount === 0 || !recipientAddress) return;
    // Private notes are mandatory (Tahap 3 design decision) -- a
    // supporter cannot deposit at all if the creator hasn't activated
    // premium / published an encryption public key.
    if (!creatorIsPremium || !creatorEncryptionPubKey) {
      setStatus("This creator hasn't activated private notes yet.");
      return;
    }
    setBusy(true);
    setStatus("Generating secret and nullifier...");
    try {
      const secret        = generateSecret();
      const nullifier     = generateNullifier();
      setStatus("Computing recipient hash...");
      // IMPORTANT: recipientHash is computed from the CREATOR's address
      // (decoded from the tip link), not the supporter's own address —
      // the supporter is paying, the creator is the intended claimant.
      const recipientHash = await computeRecipientHash(recipientAddress);
      const commitment    = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash = await computeNullifierHash(nullifier);
      const commitmentHex = decimalToHex32(commitment);
      const client        = buildClient(address, token.symbol);

      // Encrypt note BEFORE deposit so bundle can be stored on-chain
      // as the `message` field -- creator auto-fetches it later.
      setStatus("Encrypting note for the creator...");
      const partialNote: PrivateNote = {
        version: "growthip-v3", secret, nullifier, recipientHash,
        commitment: commitmentHex, nullifierHash: decimalToHex32(nullifierHash),
        root: "0".padStart(64, "0"), token: token.symbol as TokenSymbol,
        amount: String(contractAmount), timestamp: Date.now(), depositIndex: -1, claimed: false,
        recipientAddress: recipientAddress ?? undefined,
        poolId: buildClient(address, token.symbol) ? (token.symbol === "USDC"
          ? process.env.NEXT_PUBLIC_POOL_USDC_ID
          : process.env.NEXT_PUBLIC_POOL_ID) : undefined,
      };
      const noteBytes = new TextEncoder().encode(JSON.stringify(partialNote));
      const encryptedBundle = await encryptNoteForRecipient(creatorEncryptionPubKey, noteBytes);

      setStatus("Approve the deposit transaction in your wallet...");
      const tx = await client.deposit_paid({
        depositor:  address,
        commitment: Buffer.from(commitmentHex, "hex"),
        amount:     BigInt(contractAmount),
        // Encrypted bundle stored on-chain -- creator fetches automatically.
        message:    encryptedBundle
          ? encryptedBundle
          : message.trim() ? message.trim() : undefined,
      });
      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);

      const newNote: PrivateNote = { ...partialNote, depositIndex };
      if (recipientAddress) saveNote(recipientAddress, newNote);
      setSentNote(newNote);
      setEncryptedNoteBundle(encryptedBundle);
      setStatus("Tip sent!");
      setStep("done");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  const fmtDisplay = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
  const shortAddr  = recipientAddress
    ? `${recipientAddress.slice(0, 4)}...${recipientAddress.slice(-4)}`
    : "";

  // ── Invalid link state ──────────────────────────────────────────────
  if (linkError) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ textAlign: "center", maxWidth: "360px" }}>
          <Icon icon="ph:link-break-bold" style={{ fontSize: "40px", color: "#A3A3A3" }} />
          <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A", marginTop: "12px" }}>Invalid Tip Link</p>
          <p style={{ fontSize: "14px", color: "#737373", marginTop: "6px" }}>{linkError}</p>
        </div>
      </div>
    );
  }

  if (!recipientAddress) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFAFA", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon icon="ph:spinner-bold" style={{ fontSize: "28px", color: "#A3A3A3", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFAFA", padding: "32px 16px" }}>
      <div style={{ maxWidth: "480px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "16px" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          {creatorDisplayName ? (
            <img
              src={avatarUrlFor(recipientAddress ?? "", creatorAvatarVariant)}
              alt={creatorDisplayName}
              width={56} height={56}
              style={{ width: 56, height: 56, borderRadius: "50%", border: "1px solid #E5E5E5", background: "#F5F5F5", margin: "0 auto 12px", display: "block" }}
            />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#F5F5F5", border: "2px dashed #D4D4D4", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:user-circle-dashed-bold" style={{ fontSize: "32px", color: "#A3A3A3" }} />
            </div>
          )}
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>
            Send a Private Tip{creatorDisplayName ? ` to ${creatorDisplayName}` : ""}
          </h1>
          <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px", fontFamily: "monospace" }}>
            {creatorDisplayName ? shortAddr : (tipId ? `${tipId.slice(0, 6)}...${tipId.slice(-4)}` : "")}
          </p>
        </div>

        {/* Privacy badge */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", padding: "8px 14px", borderRadius: "999px", background: "#F0FDF4", border: "1px solid #BBF7D0", margin: "0 auto" }}>
          <Icon icon="ph:shield-check-bold" style={{ fontSize: "14px", color: "#22c55e" }} />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#22c55e" }}>Zero-knowledge — your identity stays private</span>
        </div>

        <div style={{ borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2", padding: "12px 16px" }}>
          <p style={{ fontSize: "13px", fontWeight: 700, color: "#EF4444" }}>Testnet Only</p>
          <p style={{ fontSize: "12px", color: "#737373", marginTop: "2px" }}>This uses testnet tokens. Do not use real funds.</p>
        </div>

        {!address ? (
          <Card>
            <p style={{ fontSize: "14px", color: "#737373", marginBottom: "16px", textAlign: "center" }}>
              Connect your wallet to send a tip.
            </p>
            <button
              onClick={connectWallet}
              disabled={walletBusy}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: walletBusy ? "not-allowed" : "pointer", opacity: walletBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Icon icon="ph:wallet" style={{ fontSize: "18px" }} />
              {walletBusy ? "Connecting..." : "Connect Wallet"}
            </button>
            {walletStatus && <p style={{ fontSize: "12px", color: "#737373", marginTop: "12px", textAlign: "center" }}>{walletStatus}</p>}
          </Card>
        ) : (
          <>
            {/* Connected wallet indicator -- browser wallet extensions
                (Freighter, xBull) are a single global account, not per-tab.
                This makes it explicit which wallet is currently active,
                since the page cannot switch it programmatically -- the
                user must do that inside the wallet extension's own popup. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "white" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Icon icon="ph:wallet-bold" style={{ fontSize: "14px", color: "#737373" }} />
                <span style={{ fontSize: "12px", color: "#737373" }}>Connected:</span>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#171717", fontFamily: "monospace" }}>
                  {address.slice(0, 4)}...{address.slice(-4)}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#A3A3A3" }}>Switch in your wallet</span>
            </div>

            {recipientAddress && address === recipientAddress && (
              <div style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid #FDE68A", background: "#FFFBEB", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                <Icon icon="ph:warning-bold" style={{ fontSize: "16px", color: "#92400E", flexShrink: 0, marginTop: "1px" }} />
                <p style={{ fontSize: "12px", color: "#92400E", lineHeight: 1.5 }}>
                  Your connected wallet is the same as this tip link&apos;s recipient. You&apos;re about to send a tip to yourself. If that&apos;s not intended, switch accounts inside your wallet extension first.
                </p>
              </div>
            )}

          <Card>
            {step === "select" && premiumChecked && !creatorIsPremium && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center", textAlign: "center", padding: "12px 0" }}>
                <Icon icon="ph:lock-key-bold" style={{ fontSize: "32px", color: "#A3A3A3" }} />
                <p style={{ fontSize: "15px", fontWeight: 700, color: "#171717" }}>This creator hasn&apos;t activated private notes yet</p>
                <p style={{ fontSize: "13px", color: "#737373", lineHeight: 1.6, maxWidth: "320px" }}>
                  Growthip requires creators to activate end-to-end encrypted notes before they can receive tips.
                  Share this link with them so they can turn it on.
                </p>
                <button
                  onClick={() => { navigator.clipboard.writeText(window.location.href); }}
                  style={{ marginTop: "8px", padding: "10px 16px", borderRadius: "10px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  <Icon icon="ph:copy-simple-bold" />
                  Copy Link to Share
                </button>
              </div>
            )}

            {step === "select" && premiumChecked && creatorIsPremium && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Select Token</p>
                  <TokenSelector value={token.symbol} onChange={(t) => { setToken(t); setContractAmount(0); setDisplayAmount(0); }} />
                </div>

                <AmountSelector
                  key={token.symbol}
                  token={{ ...token, presets: poolTipAmount !== null
                    ? [1, 5, 10, 20].map((m) => (poolTipAmount * m) / 1e7)
                    : token.presets }}
                  onAmountChange={(ca, da) => { setContractAmount(ca); setDisplayAmount(da); fetchNetworkFee(); }}
                />
                {poolTipAmount !== null && (
                  <p style={{ fontSize: "11px", color: "#A3A3A3" }}>
                    Minimum tip: {poolTipAmount / 1e7} {token.symbol}
                  </p>
                )}

                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em" }}>Message (optional, public)</p>
                    <span style={{ fontSize: "11px", color: message.length > MAX_MESSAGE_LEN ? "#EF4444" : "#A3A3A3" }}>{message.length}/{MAX_MESSAGE_LEN}</span>
                  </div>
                  <input
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN))}
                    placeholder="Keep up the great work!"
                    style={{ width: "100%", fontSize: "13px", color: "#0A0A0A", background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "10px", padding: "10px 12px", outline: "none" }}
                  />
                  <p style={{ fontSize: "11px", color: "#A3A3A3", marginTop: "6px" }}>
                    This message is stored on-chain and visible to anyone — your wallet address is not linked to it.
                  </p>
                </div>

                {contractAmount > 0 && (
                  <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #D1FAE5", background: "#F0FDF4" }}>
                    <p style={{ fontSize: "12px", color: "#737373" }}>You will send</p>
                    <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>{fmtDisplay(displayAmount)} {token.symbol}</p>
                    <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #D1FAE5", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#737373" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          Platform fee (1%)
                          <span style={{ position: "relative", display: "inline-flex" }}
                            onMouseEnter={(e) => { const t = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement; if (t) t.style.display = "block"; }}
                            onMouseLeave={(e) => { const t = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement; if (t) t.style.display = "none"; }}
                          >
                            <Icon icon="ph:info-bold" style={{ fontSize: "12px", color: "#A3A3A3", cursor: "pointer" }} />
                            <span data-tooltip style={{ display: "none", position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "white", color: "#171717", fontSize: "12px", borderRadius: "12px", padding: "10px 12px", width: "220px", zIndex: 50, lineHeight: 1.6, pointerEvents: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #E5E5E5", whiteSpace: "normal", fontWeight: 400 }}>
                              A small 1% fee goes to Growthip to keep the platform running. This is automatically deducted when the creator withdraws their tip — you always send the full amount you choose.
                              <span style={{ position: "absolute", bottom: "-5px", left: "50%", transform: "translateX(-50%) rotate(45deg)", width: "8px", height: "8px", background: "white", border: "1px solid #E5E5E5", borderTop: "none", borderLeft: "none", display: "block" }} />
                            </span>
                          </span>
                        </span>
                        <span>~{(displayAmount * 0.01).toFixed(2)} {token.symbol}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#737373" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          Est. network fee
                          <span style={{ position: "relative", display: "inline-flex" }}
                            onMouseEnter={(e) => { const t = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement; if (t) t.style.display = "block"; }}
                            onMouseLeave={(e) => { const t = e.currentTarget.querySelector("[data-tooltip]") as HTMLElement; if (t) t.style.display = "none"; }}
                          >
                            <Icon icon="ph:info-bold" style={{ fontSize: "12px", color: "#A3A3A3", cursor: "pointer" }} />
                            <span data-tooltip style={{ display: "none", position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "white", color: "#171717", fontSize: "12px", borderRadius: "12px", padding: "10px 12px", width: "220px", zIndex: 50, lineHeight: 1.6, pointerEvents: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", border: "1px solid #E5E5E5", whiteSpace: "normal", fontWeight: 400 }}>
                              This is an estimate of the small fee paid to the Stellar network to process your transaction — like a postage stamp for your tip. The actual amount may vary slightly depending on network conditions at the time you send.
                              <span style={{ position: "absolute", bottom: "-5px", left: "50%", transform: "translateX(-50%) rotate(45deg)", width: "8px", height: "8px", background: "white", border: "1px solid #E5E5E5", borderTop: "none", borderLeft: "none", display: "block" }} />
                            </span>
                          </span>
                        </span>
                        <span>~0.134 XLM</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, color: "#0A0A0A", marginTop: "4px", paddingTop: "4px", borderTop: "1px solid #D1FAE5" }}>
                        <span>Creator receives</span>
                        <span>~{(displayAmount * 0.99).toFixed(2)} {token.symbol}</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => setStep("confirm")}
                  disabled={!isTestnet || contractAmount === 0}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: contractAmount > 0 ? "#0A0A0A" : "#E5E5E5", color: contractAmount > 0 ? "white" : "#A3A3A3", fontSize: "14px", fontWeight: 700, border: "none", cursor: contractAmount > 0 ? "pointer" : "not-allowed" }}
                >
                  {contractAmount > 0 ? `Continue — ${fmtDisplay(displayAmount)} ${token.symbol}` : "Select an amount"}
                </button>
              </div>
            )}

            {step === "confirm" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A" }}>Confirm Tip</p>
                {[["Amount", `${fmtDisplay(displayAmount)} ${token.symbol}`], ["To", tipId ? `${tipId.slice(0, 6)}...${tipId.slice(-4)}` : ""], ["Message", message || "(none)"]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                    <span style={{ fontSize: "13px", color: "#A3A3A3" }}>{l}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A", textAlign: "right", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                  </div>
                ))}
                <div style={{ padding: "12px 14px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "2px" }}>Fee Estimate</p>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#737373" }}>
                    <span>Platform fee (1%)</span>
                    <span>~{(displayAmount * 0.01).toFixed(2)} {token.symbol}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#737373" }}>
                    <span>Est. network fee</span>
                    <span>~0.134 XLM</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700, color: "#0A0A0A", paddingTop: "6px", borderTop: "1px solid #E5E5E5", marginTop: "2px" }}>
                    <span>Creator receives</span>
                    <span>~{(displayAmount * 0.99).toFixed(2)} {token.symbol}</span>
                  </div>
                </div>
                <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF" }}>
                  <p style={{ fontSize: "13px", color: "#525252", lineHeight: 1.6 }}>
                    A private note will be generated after sending — save it, it&apos;s the only way the creator can claim this tip.
                  </p>
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={busy}
                  style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: busy ? "not-allowed" : "pointer", opacity: busy ? 0.7 : 1 }}
                >
                  {busy ? (status || "Processing...") : `Send ${fmtDisplay(displayAmount)} ${token.symbol}`}
                </button>
                <button
                  onClick={() => setStep("select")}
                  disabled={busy}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "transparent", color: "#525252", fontSize: "14px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}
                >
                  Back
                </button>
              </div>
            )}

            {step === "done" && sentNote && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <Icon icon="ph:check-circle-bold" style={{ fontSize: "36px", color: "#22c55e" }} />
                  <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A", marginTop: "8px" }}>Tip sent!</p>
                  <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>Send this private note to the creator so they can claim it.</p>
                </div>
                <div style={{ padding: "12px 14px", borderRadius: "10px", border: "1px solid #D1FAE5", background: "#F0FDF4", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Icon icon="ph:lock-key-bold" style={{ fontSize: "16px", color: "#22C55E" }} />
                  <p style={{ fontSize: "12px", color: "#15803D" }}>This note is end-to-end encrypted -- only the creator can read it.</p>
                </div>
                <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Encrypted Note</p>
                  <textarea
                    readOnly
                    rows={6}
                    value={encryptedNoteBundle ?? ""}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ width: "100%", fontFamily: "monospace", fontSize: "11px", color: "#525252", background: "white", border: "1px solid #E5E5E5", borderRadius: "8px", padding: "12px", resize:"none", wordBreak: "break-all" }}
                  />
                </div>
                <button
                  onClick={() => {
                    if (!encryptedNoteBundle) return;
                    navigator.clipboard.writeText(encryptedNoteBundle);
                    setCopiedNote(true);
                    setTimeout(() => setCopiedNote(false), 2000);
                  }}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: copiedNote ? "#22c55e" : "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <Icon icon={copiedNote ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "18px" }} />
                  {copiedNote ? "Copied!" : "Copy Encrypted Note"}
                </button>
                <button
                  onClick={() => setShowQR((prev) => !prev)}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "transparent", color: "#525252", fontSize: "14px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <Icon icon="ph:qr-code-bold" style={{ fontSize: "18px" }} />
                  {showQR ? "Hide QR Code" : "Show QR Code"}
                </button>
                {showQR && encryptedNoteBundle && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                    <div style={{ background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #E5E5E5" }}>
                      <QRCodeSVG value={encryptedNoteBundle} size={180} level="M" />
                    </div>
                    <p style={{ fontSize: "12px", color: "#737373", textAlign: "center", maxWidth: "260px" }}>
                      Let the creator scan this directly to claim.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
          </>
        )}

        <p style={{ textAlign: "center", fontSize: "12px", color: "#A3A3A3" }}>
          Powered by <strong style={{ color: "#525252" }}>Growthip</strong> — privacy-preserving tipping on Stellar
        </p>
      <WalletModal
          show={showWalletModal}
          onClose={() => setShowWalletModal(false)}
          onSelectWallet={async (walletId) => {
            try {
              const { connectWithWallet } = await import("@/lib/wallet");
              const addr = await connectWithWallet(walletId);
              setAddress(addr);
              setNetwork("TESTNET");
              void warmPoseidon();
              setWalletStatus("Connected!");
              setShowWalletModal(false);
            } catch (err) {
              setWalletStatus(err instanceof Error ? err.message : "Failed.");
            } finally {
              setWalletBusy(false);
            }
          }}
        />
      </div>
    </div>
  );
}