"use client";

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
import { config } from "@/lib/config";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, type PrivateNote } from "@/lib/note";
import { decodeTipId } from "@/lib/addressId";
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
  const [linkError, setLinkError] = useState("");

  // Wallet
  const [address, setAddress]     = useState("");
  const [network, setNetwork]     = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");
  const isTestnet = network.toUpperCase() === "TESTNET";

  // Send flow
  const [step, setStep]                     = useState<Step>("select");
  const [token, setToken]                   = useState<Token>(getAvailableTokens()[0]);
  const [contractAmount, setContractAmount] = useState(0);
  const [displayAmount, setDisplayAmount]   = useState(0);
  const [message, setMessage]               = useState("");
  const [busy, setBusy]                     = useState(false);
  const [status, setStatus]                 = useState("");
  const [sentNote, setSentNote]             = useState<PrivateNote | null>(null);
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

  // Decode the tip ID into a real Stellar address on mount.
  useEffect(() => {
    if (!tipId) return;
    try {
      const decoded = decodeTipId(tipId);
      setRecipientAddress(decoded);
    } catch {
      setLinkError("This tip link is invalid or corrupted.");
    }
  }, [tipId]);

  async function connectWallet() {
    setWalletBusy(true);
    setWalletStatus("Connecting...");
    try {
      const conn = await isConnected();
      if (!conn.isConnected) { setWalletStatus("Freighter not installed."); return; }
      await setAllowed();
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      setAddress(access.address);
      const net = await getNetwork();
      setNetwork(net.network ?? "");
      void warmPoseidon();
      setWalletStatus("Connected!");
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
          const signed = await freighterSign(xdr, { address: publicKey, networkPassphrase: NETWORK_PASSPHRASE });
          if (signed.error) throw new Error(String(signed.error));
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      });
    },
    [PoolClient],
  );

  async function handleDeposit() {
    if (!address || !isTestnet || !PoolClient || contractAmount === 0 || !recipientAddress) return;
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

      setStatus("Approve the deposit transaction in Freighter...");
      const tx = await client.deposit_paid({
        depositor:  address,
        commitment: Buffer.from(commitmentHex, "hex"),
        amount:     BigInt(contractAmount),
        message:    message.trim() ? message.trim() : undefined,
      });
      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);

      const newNote: PrivateNote = {
        version: "growthip-v3", secret, nullifier, recipientHash,
        commitment: commitmentHex, nullifierHash: decimalToHex32(nullifierHash),
        root: "0".padStart(64, "0"), token: token.symbol as TokenSymbol,
        amount: String(contractAmount), timestamp: Date.now(), depositIndex, claimed: false,
      };
      saveNote(newNote);
      setSentNote(newNote);
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
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#0A0A0A", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "white", fontFamily: "monospace" }}>
              {recipientAddress.slice(0, 2)}
            </span>
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>Send a Private Tip</h1>
          <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px", fontFamily: "monospace" }}>
            to {shortAddr}
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
              Connect your Freighter wallet to send a tip.
            </p>
            <button
              onClick={connectWallet}
              disabled={walletBusy}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: walletBusy ? "not-allowed" : "pointer", opacity: walletBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Icon icon="ph:wallet" style={{ fontSize: "18px" }} />
              {walletBusy ? "Connecting..." : "Connect Freighter"}
            </button>
            {walletStatus && <p style={{ fontSize: "12px", color: "#737373", marginTop: "12px", textAlign: "center" }}>{walletStatus}</p>}
          </Card>
        ) : (
          <Card>
            {step === "select" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Select Token</p>
                  <TokenSelector value={token.symbol} onChange={(t) => { setToken(t); setContractAmount(0); setDisplayAmount(0); }} />
                </div>

                <AmountSelector
                  key={token.symbol}
                  token={token}
                  onAmountChange={(ca, da) => { setContractAmount(ca); setDisplayAmount(da); }}
                />

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
                {[["Amount", `${fmtDisplay(displayAmount)} ${token.symbol}`], ["To", shortAddr], ["Message", message || "(none)"]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                    <span style={{ fontSize: "13px", color: "#A3A3A3" }}>{l}</span>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A", textAlign: "right", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis" }}>{v}</span>
                  </div>
                ))}
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
                <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Private Note</p>
                  <textarea
                    readOnly
                    rows={6}
                    value={JSON.stringify(sentNote, null, 2)}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ width: "100%", fontFamily: "monospace", fontSize: "11px", color: "#525252", background: "white", border: "1px solid #E5E5E5", borderRadius: "8px", padding: "12px", resize: "none" }}
                  />
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(sentNote));
                    setCopiedNote(true);
                    setTimeout(() => setCopiedNote(false), 2000);
                  }}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: copiedNote ? "#22c55e" : "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <Icon icon={copiedNote ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "18px" }} />
                  {copiedNote ? "Copied!" : "Copy Note"}
                </button>
                <button
                  onClick={() => setShowQR((prev) => !prev)}
                  style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "transparent", color: "#525252", fontSize: "14px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <Icon icon="ph:qr-code-bold" style={{ fontSize: "18px" }} />
                  {showQR ? "Hide QR Code" : "Show QR Code"}
                </button>
                {showQR && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", padding: "16px", borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                    <div style={{ background: "white", padding: "12px", borderRadius: "10px", border: "1px solid #E5E5E5" }}>
                      <QRCodeSVG value={JSON.stringify(sentNote)} size={180} level="M" />
                    </div>
                    <p style={{ fontSize: "12px", color: "#737373", textAlign: "center", maxWidth: "260px" }}>
                      Let the creator scan this directly to claim.
                    </p>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        <p style={{ textAlign: "center", fontSize: "12px", color: "#A3A3A3" }}>
          Powered by <strong style={{ color: "#525252" }}>Growthip</strong> — privacy-preserving tipping on Stellar
        </p>
      </div>
    </div>
  );
}