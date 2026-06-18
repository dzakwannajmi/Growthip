"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrices, useWalletBalances } from "@/lib/useMarket";
import { Buffer } from "buffer";
import { Icon } from "@iconify/react";
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
import { hexToBuffer, generateProof, toClaimArgs, type ProofProgress } from "@/lib/zkp";
import {
  buildMerkleTree,
  getMerklePathByIndex,
  hexToDecimal,
  bytesToDecimal,
  MAX_LEAVES,
  type MerklePath,
} from "@/lib/merkle";
import { config } from "@/lib/config";
import WalletModal from "@/components/WalletModal";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, getPendingNotes, getClaimedNotes, markNoteAsClaimed, formatRelativeTime, type PrivateNote } from "@/lib/note";
import TokenSelector from "@/components/TokenSelector";
import AmountSelector from "@/components/AmountSelector";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

// ── Types ──────────────────────────────────────────────────────────────────
interface TokenPrice { percent: string; isUp: boolean }

// ── Helpers ────────────────────────────────────────────────────────────────
function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

function commitmentToDecimal(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return hexToDecimal(raw);
  return bytesToDecimal(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

function formatAmount(note: PrivateNote): string {
  const tokens = getAvailableTokens();
  const token  = tokens.find((t) => t.symbol === note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}

// ── Tooltip component ─────────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <Icon
        icon="ph:info"
        style={{ fontSize: "14px", color: "#A3A3A3", cursor: "help" }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 12px)", left: "0",
          background: "white", color: "#171717",
          fontSize: "12px", fontWeight: 500, padding: "10px 14px", borderRadius: "12px",
          whiteSpace: "normal", maxWidth: "240px", width: "240px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.12)", zIndex: 100, lineHeight: 1.6,
          pointerEvents: "none", border: "1px solid #E5E5E5",
        }}>
          {text}
          {/* Speech bubble pointer - bottom left */}
          <div style={{
            position: "absolute", top: "100%", left: "10px",
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid #E5E5E5",
          }} />
          <div style={{
            position: "absolute", top: "calc(100% - 1px)", left: "10px",
            width: 0, height: 0,
            borderLeft: "8px solid transparent",
            borderRight: "8px solid transparent",
            borderTop: "8px solid white",
          }} />
        </div>
      )}
    </div>

  );
}

// ── Live price simulation ──────────────────────────────────────────────────
function useLivePrices() {
  const [xlm,  setXlm]  = useState<TokenPrice>({ percent: "+2.45%", isUp: true });
  const [usdc, setUsdc] = useState<TokenPrice>({ percent: "+0.01%", isUp: true });
  const [total, setTotal] = useState({ percent: "+0.00%", value: "(+$0.00)", isUp: true });

  useEffect(() => {
    function tick() {
      const move = (vol: number) => {
        const isUp = Math.random() > 0.45;
        return { percent: `${isUp ? "+" : "-"}${(Math.random() * vol).toFixed(2)}%`, isUp };
      };
      const nt = move(3.0);
      const dc = (1000 * Math.abs(parseFloat(nt.percent)) / 100).toFixed(2);
      setXlm(move(5.0));
      setUsdc(move(0.05));
      setTotal({ percent: nt.percent, value: `(${nt.isUp ? "+" : "-"}$${dc})`, isUp: nt.isUp });
    }
    const t = setTimeout(tick, 1000);
    const i = setInterval(tick, 4500);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return { xlm, usdc, total };
}

// ── Card wrapper ───────────────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "24px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>
      {children}
    </p>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  // Wallet state
  const [address,  setAddress]  = useState<string>("");
  const [network,  setNetwork]  = useState<string>("");
  const [walletBusy, setWalletBusy]   = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");

  const isTestnet = network.toUpperCase() === "TESTNET";

  // Load wallet from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const addr = localStorage.getItem("growthip:wallet") ?? "";
    const net  = localStorage.getItem("growthip:network") ?? "";
    setAddress(addr);
    setNetwork(net);
    setRecipient(addr);
  }, []);

  // UI state
  const [copied, setCopied]   = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "withdraw">("send");

  // Send tip state
  const [sendToken, setSendToken]         = useState<Token>(getAvailableTokens()[0]);
  const [contractAmount, setContractAmount] = useState(0);
  const [displayAmount, setDisplayAmount]   = useState(0);
  const [sendStep, setSendStep]             = useState<"select" | "confirm" | "done">("select");
  const [sendBusy, setSendBusy]             = useState(false);
  const [sendStatus, setSendStatus]         = useState("");
  const [sentNote, setSentNote]             = useState<PrivateNote | null>(null);
  const [copiedNote, setCopiedNote]         = useState(false);

  // Withdraw (claim) state
  const [noteInput, setNoteInput]     = useState("");
  const [recipient, setRecipient]     = useState("");
  const [claimBusy, setClaimBusy]     = useState(false);
  const [claimProgress, setClaimProgress] = useState<ProofProgress | null>(null);
  const [claimStatus, setClaimStatus] = useState("");
  const [claimStage, setClaimStage]   = useState<"idle" | "loading" | "proving" | "submitting" | "done" | "error">("idle");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimError, setClaimError]   = useState("");

  // Notes state
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);

  const { xlm, usdc, total } = useLivePrices();
  const { prices }                = usePrices();
  const { balances, refetch: refetchBalances } = useWalletBalances(address);

  // Pool client
  const [PoolClient, setPoolClient] = useState<null | {
    Client: typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) =>
      setPoolClient({ Client: mod.Client, networks: mod.networks })
    );
  }, []);

  // Load notes from localStorage
  useEffect(() => {
    setPending(getPendingNotes());
    setClaimed(getClaimedNotes());
  }, [sentNote, claimTxHash]);

  // ── Build client ────────────────────────────────────────────────────────
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

  // ── Connect wallet ──────────────────────────────────────────────────────
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
      localStorage.setItem("growthip:wallet", access.address);
      setRecipient(access.address);
      const net = await getNetwork();
      setNetwork(net.network ?? "");
      localStorage.setItem("growthip:network", net.network ?? "");
      void warmPoseidon();
      setWalletStatus("Connected!");
      refetchBalances();
    } catch (err) {
      setWalletStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  // ── Send Tip ────────────────────────────────────────────────────────────
  async function handleDeposit() {
    if (!address || !isTestnet || !PoolClient || contractAmount === 0) return;
    setSendBusy(true);
    setSendStatus("Generating secret and nullifier...");
    try {
      const secret        = generateSecret();
      const nullifier     = generateNullifier();
      setSendStatus("Computing recipient hash...");
      const recipientHash = await computeRecipientHash(address);
      const commitment    = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash = await computeNullifierHash(nullifier);
      const commitmentHex = decimalToHex32(commitment);
      const client        = buildClient(address, sendToken.symbol);

      setSendStatus("Checking registration...");
      const existing = await client.get_recipient_hash({ recipient: address });
      if (existing.result == null) {
        setSendStatus("Registering recipient...");
        const buf = Buffer.from(decimalToHex32(recipientHash), "hex");
        const tx  = await client.register_recipient({ recipient: address, recipient_hash: buf });
        await tx.signAndSend({ force: true });
      }

      setSendStatus("Approve in Freighter...");
      const tx = await client.deposit_paid({
        depositor:  address,
        commitment: Buffer.from(commitmentHex, "hex"),
        amount:     BigInt(contractAmount),
      });
      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);

      const note: PrivateNote = {
        version: "growthip-v3", secret, nullifier, recipientHash,
        commitment: commitmentHex, nullifierHash: decimalToHex32(nullifierHash),
        root: "0".padStart(64, "0"), token: sendToken.symbol as TokenSymbol,
        amount: String(contractAmount), timestamp: Date.now(), depositIndex, claimed: false,
      };
      saveNote(note);
      setSentNote(note);
      setSendStatus("Deposit successful!");
      setSendStep("done");
    } catch (err) {
      setSendStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setSendBusy(false);
    }
  }

  // ── Withdraw (Claim) ────────────────────────────────────────────────────
  async function handleClaim() {
    if (!address || !isTestnet || !PoolClient) return;
    setClaimError("");
    setClaimTxHash("");
    setClaimStage("loading");
    setClaimBusy(true);

    try {
      // Parse note
      const raw = noteInput.trim();
      let note: PrivateNote;
      try {
        note = raw.startsWith("{") ? JSON.parse(raw) : JSON.parse(atob(raw));
      } catch {
        throw new Error("Invalid note format.");
      }
      if (note.version !== "growthip-v3") throw new Error("Unsupported note version.");
      if (note.claimed) throw new Error("This note has already been claimed.");

      const client = buildClient(recipient || address, note.token);

      // Load commitments
      setClaimStatus("Loading pool commitments...");
      const totalTx = await client.total_deposits();
      const total   = Number(totalTx.result);
      if (total === 0) throw new Error("Pool is empty.");
      if (total > MAX_LEAVES) throw new Error(`Pool is full (${total}/${MAX_LEAVES}).`);

      const commitments: string[] = [];
      for (let i = 0; i < total; i++) {
        const cTx = await client.get_commitment({ index: i });
        commitments.push(commitmentToDecimal(cTx.result as Buffer));
      }

      const leafIndex = commitments.indexOf(hexToDecimal(note.commitment));
      if (leafIndex === -1) throw new Error("Commitment not found in pool.");

      // Build Merkle tree
      setClaimStatus("Building Merkle tree...");
      const tree: Awaited<ReturnType<typeof buildMerkleTree>> = await buildMerkleTree(commitments);
      const merklePath: MerklePath = getMerklePathByIndex(tree, leafIndex);

      // Generate proof
      setClaimStage("proving");
      setClaimStatus("Generating ZK proof (5–15s)...");
      const generated = await generateProof(note, merklePath, (p) => setClaimProgress(p));

      // Submit
      setClaimStage("submitting");
      setClaimStatus("Submitting proof...");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({
        recipient: recipient || address,
        proof_bytes,
        public_inputs,
      });
      const sent = await claimTx.signAndSend({ force: true });

      if (sent.result === false) throw new Error("Claim rejected by contract.");

      const hash = sent.sendTransactionResponse?.hash ?? "submitted";
      setClaimTxHash(hash);
      markNoteAsClaimed(note.nullifierHash, hash);
      setClaimStage("done");
      setNoteInput("");
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Claim failed.");
      setClaimStage("error");
    } finally {
      setClaimBusy(false);
      setClaimProgress(null);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText("https://growthip.vercel.app/tip/creator");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const fmtDisplay = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding: "32px", background: "#FAFAFA" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "80px" }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Dashboard</h1>
          <p style={{ fontSize: "14px", fontWeight: 400, color: "#737373" }}>Welcome back, @creator!</p>
        </div>

        {/* Stealth Balances */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#171717" }}>Your Stealth Balances</span>
            <InfoTooltip text="Prices via CoinGecko free API (may be rate-limited). If balance seems incorrect, check your wallet directly." />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <span style={{ fontSize: "48px", fontWeight: 800, color: "#0A0A0A", lineHeight: 1 }}>
                ${address ? (balances.xlm * prices.xlm.usd + balances.usdc * prices.usdc.usd).toFixed(2) : "0.00"}
              </span>
              <span style={{ fontSize: "14px", fontWeight: 600, color: "#737373", marginBottom: "6px" }}>USD</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
              {(() => {
                const totalUsd = balances.xlm * prices.xlm.usd + balances.usdc * prices.usdc.usd;
                const change24h = prices.xlm.usd_24h_change;
                const isUp = change24h >= 0;
                const dollarChange = Math.abs(totalUsd * change24h / 100);
                return address && totalUsd > 0 ? (
                  <>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "13px", fontWeight: 700, color: isUp ? "#22c55e" : "#ef4444" }}>
                      <Icon icon={isUp ? "ph:trend-up-bold" : "ph:trend-down-bold"} style={{ marginRight: "4px" }} />
                      {(isUp ? "+" : "") + change24h.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: isUp ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)" }}>
                      ({isUp ? "+" : "-"}${dollarChange.toFixed(2)})
                    </span>
                  </>
                ) : null;
              })()}
            </div>
          </div>

          <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Tokens</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {[
              {
                icon: "cryptocurrency-color:xlm", name: "XLM", sub: "Stellar Network",
                balance: balances.xlm, usdValue: balances.xlm * prices.xlm.usd,
                change: prices.xlm.usd_24h_change, price: prices.xlm.usd,
              },
              {
                icon: "cryptocurrency-color:usdc", name: "USDC", sub: "USD Coin",
                balance: balances.usdc, usdValue: balances.usdc * prices.usdc.usd,
                change: prices.usdc.usd_24h_change, price: prices.usdc.usd,
              },
            ].map(({ icon, name, sub, balance, usdValue, change, price }) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon={icon} style={{ fontSize: "20px" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{name}</div>
                    <div style={{ fontSize: "11px", color: "#737373" }}>
                      {sub}{price > 0 && <span style={{ marginLeft: "6px", color: "#A3A3A3" }}>${price.toFixed(4)}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>{balance > 0 ? balance.toFixed(2) : "0"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "10px", fontWeight: 700, color: change >= 0 ? "#22c55e" : "#ef4444" }}>
                      <Icon icon={change >= 0 ? "ph:trend-up-bold" : "ph:trend-down-bold"} style={{ marginRight: "2px" }} />
                      {(change >= 0 ? "+" : "") + change.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: "11px", color: "#737373" }}>${usdValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* EURC */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "12px", color: "#0A0A0A" }}>€</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A", display: "flex", alignItems: "center", gap: "8px" }}>
                    EURC
                    <span style={{ fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px", background: "#E5E5E5", color: "#525252", textTransform: "uppercase", letterSpacing: "0.05em" }}>Soon</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "#737373" }}>Euro Coin</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>-</div>
                <div style={{ fontSize: "11px", color: "#737373" }}>€0.00</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Wallet Connection / Action Area */}
        {!address ? (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Icon icon="ph:wallet-bold" style={{ fontSize: "18px" }} />
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#171717" }}>Wallet Connection</span>
            </div>
            <p style={{ fontSize: "13px", color: "#525252", marginBottom: "20px" }}>
              Connect your wallet to send or withdraw tips.
            </p>
            <button
              onClick={() => setShowWalletModal(true)}
              disabled={walletBusy}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: walletBusy ? "not-allowed" : "pointer", opacity: walletBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Icon icon="ph:wallet" style={{ fontSize: "18px" }} />
              {walletBusy ? "Connecting..." : "Connect Wallet"}
            </button>
            {walletStatus && <p style={{ fontSize: "12px", color: "#737373", marginTop: "12px" }}>{walletStatus}</p>}
          </Card>
        ) : (
          /* Wallet connected - show Send/Withdraw tabs */
          <Card style={{ padding: 0 }}>
            {/* Wallet info bar */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F5F5F5", border: "1px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="ph:wallet-bold" style={{ fontSize: "16px", color: "#525252" }} />
                </div>
                <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#525252", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <span style={{ fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", background: isTestnet ? "#F0FDF4" : "#FEF2F2", color: isTestnet ? "#22c55e" : "#ef4444" }}>
                  {network === "TESTNET" ? "Testnet" : network === "FUTURENET" ? "Futurenet" : network}
                </span>
                <button
                  onClick={() => {}}
                  title="Swap wallet (coming soon)"
                  style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #E5E5E5", background: "#FAFAFA", cursor: "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5 }}
                >
                  <Icon icon="ph:arrows-left-right-bold" style={{ fontSize: "14px", color: "#525252" }} />
                </button>
                <button
                  onClick={() => {
                    setAddress("");
                    setNetwork("");
                    localStorage.removeItem("growthip:wallet");
                    localStorage.removeItem("growthip:network");
                  }}
                  title="Disconnect wallet"
                  style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #E5E5E5", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon icon="ph:sign-out-bold" style={{ fontSize: "14px", color: "#525252" }} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: "1px solid #E5E5E5" }}>
              {(["send", "withdraw"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    flex: 1, padding: "14px", fontSize: "14px", fontWeight: 700, border: "none",
                    background: "transparent", cursor: "pointer",
                    color: activeTab === tab ? "#0A0A0A" : "#A3A3A3",
                    borderBottom: activeTab === tab ? "2px solid #0A0A0A" : "2px solid transparent",
                    transition: "all 0.2s",
                  }}
                >
                  {tab === "send" ? "Send Tip" : "Withdraw"}
                </button>
              ))}
            </div>

            {/* Send Tip tab */}
            {activeTab === "send" && (
              <div style={{ padding: "24px" }}>
                {sendStep === "select" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div>
                      <SectionTitle>Select Token</SectionTitle>
                      <TokenSelector value={sendToken.symbol} onChange={(t) => { setSendToken(t); setContractAmount(0); setDisplayAmount(0); }} />
                    </div>
                    <AmountSelector
                      key={sendToken.symbol}
                      token={sendToken}
                      onAmountChange={(ca, da) => { setContractAmount(ca); setDisplayAmount(da); }}
                    />
                    {contractAmount > 0 && (
                      <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #D1FAE5", background: "#F0FDF4" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <p style={{ fontSize: "12px", color: "#737373" }}>You will deposit</p>
                            <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A" }}>{fmtDisplay(displayAmount)} {sendToken.symbol}</p>
                            <p style={{ fontSize: "11px", color: "#A3A3A3", marginTop: "2px" }}>+ ~0.008 XLM network fee</p>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <p style={{ fontSize: "11px", color: "#A3A3A3" }}>Pool</p>
                            <p style={{ fontSize: "11px", fontWeight: 600, color: "#525252", fontFamily: "monospace" }}>{sendToken.poolId.slice(0, 6)}...{sendToken.poolId.slice(-4)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setSendStep("confirm")}
                      disabled={!isTestnet || contractAmount === 0}
                      style={{ width: "100%", padding: "12px", borderRadius: "12px", background: contractAmount > 0 ? "#0A0A0A" : "#E5E5E5", color: contractAmount > 0 ? "white" : "#A3A3A3", fontSize: "14px", fontWeight: 700, border: "none", cursor: contractAmount > 0 ? "pointer" : "not-allowed" }}
                    >
                      {contractAmount > 0 ? `Continue — ${fmtDisplay(displayAmount)} ${sendToken.symbol}` : "Select an amount"}
                    </button>
                  </div>
                )}

                {sendStep === "confirm" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A" }}>Confirm Deposit</p>
                    {[["Token", sendToken.name], ["Amount", `${fmtDisplay(displayAmount)} ${sendToken.symbol}`], ["Network", "Stellar Testnet"]].map(([l, v]) => (
                      <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderRadius: "10px", border: "1px solid #E5E5E5", background: "#FAFAFA" }}>
                        <span style={{ fontSize: "13px", color: "#A3A3A3" }}>{l}</span>
                        <span style={{ fontSize: "13px", fontWeight: 600, color: "#0A0A0A" }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "white", padding: "14px" }}>
                      <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Fee Estimate</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "#737373" }}>Soroban resource fee</span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#0A0A0A" }}>~0.008 XLM</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "#737373" }}>Recipient registration (first time)</span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#0A0A0A" }}>~0.005 XLM</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "12px", color: "#737373" }}>ZK commitment generation</span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#22c55e" }}>Browser-side (free)</span>
                        </div>
                        <div style={{ borderTop: "1px solid #E5E5E5", paddingTop: "8px", display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}>Total est.</span>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: "#0A0A0A" }}>{fmtDisplay(displayAmount)} {sendToken.symbol} + ~0.014 XLM</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: "14px", borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF" }}>
                      <p style={{ fontSize: "13px", color: "#525252", lineHeight: 1.6 }}>
                        A fresh <strong>secret</strong> and <strong>nullifier</strong> will be generated. Save your <strong>private note</strong> — it is the only way to claim.
                      </p>
                    </div>
                    <button
                      onClick={handleDeposit}
                      disabled={sendBusy}
                      style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: sendBusy ? "not-allowed" : "pointer", opacity: sendBusy ? 0.7 : 1 }}
                    >
                      {sendBusy ? (sendStatus || "Processing...") : `Deposit ${fmtDisplay(displayAmount)} ${sendToken.symbol}`}
                    </button>
                    <button onClick={() => setSendStep("select")} disabled={sendBusy} style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "transparent", color: "#525252", fontSize: "14px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}>
                      Back
                    </button>
                  </div>
                )}

                {sendStep === "done" && sentNote && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ textAlign: "center", padding: "16px 0" }}>
                      <p style={{ fontSize: "32px" }}>🎉</p>
                      <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A", marginTop: "8px" }}>Tip sent!</p>
                      <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>Save your private note to claim later.</p>
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
                      style={{ width: "100%", padding: "12px", borderRadius: "12px", background: copiedNote ? "#22c55e" : "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", transition: "background 0.2s" }}
                    >
                      <Icon icon={copiedNote ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "18px" }} />
                      {copiedNote ? "Copied!" : "Copy Note"}
                    </button>
                    <button
                      onClick={() => { setSendStep("select"); setContractAmount(0); setDisplayAmount(0); setSentNote(null); setActiveTab("withdraw"); setNoteInput(JSON.stringify(sentNote)); }}
                      style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "transparent", color: "#525252", fontSize: "14px", fontWeight: 600, border: "1px solid #E5E5E5", cursor: "pointer" }}
                    >
                      Claim this tip now →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Withdraw tab */}
            {activeTab === "withdraw" && (
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>

                {claimStage === "done" ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <p style={{ fontSize: "32px" }}>🎉</p>
                    <p style={{ fontSize: "18px", fontWeight: 800, color: "#0A0A0A", marginTop: "8px" }}>Tip Claimed!</p>
                    <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>ZK proof verified. Funds transferred to your wallet.</p>
                    <div style={{ marginTop: "16px", padding: "12px", borderRadius: "12px", background: "#FAFAFA", border: "1px solid #E5E5E5" }}>
                      <p style={{ fontSize: "11px", color: "#A3A3A3" }}>Transaction</p>
                      <p style={{ fontSize: "11px", fontFamily: "monospace", color: "#525252", wordBreak: "break-all", marginTop: "4px" }}>{claimTxHash}</p>
                    </div>
                    <button
                      onClick={() => { setClaimStage("idle"); setNoteInput(""); setClaimTxHash(""); }}
                      style={{ marginTop: "16px", padding: "12px 24px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer" }}
                    >
                      Claim another
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <SectionTitle>Private Note</SectionTitle>
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder='Paste your private note (JSON or base64)...'
                        rows={4}
                        disabled={claimBusy}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", color: "#0A0A0A", background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "12px", padding: "12px", resize: "none", outline: "none" }}
                      />
                    </div>
                    <div>
                      <SectionTitle>Recipient Wallet</SectionTitle>
                      <input
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="G... (defaults to connected wallet)"
                        disabled={claimBusy}
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", color: "#0A0A0A", background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "12px", padding: "12px", outline: "none" }}
                      />
                    </div>

                    {claimStage === "proving" && (
                      <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF" }}>
                        <div style={{ height: "6px", borderRadius: "999px", background: "#E5E5E5", overflow: "hidden", marginBottom: "8px" }}>
                          <div style={{ height: "100%", width: "50%", borderRadius: "999px", background: "#6366f1", animation: "pulse 1.5s infinite" }} />
                        </div>
                        <p style={{ fontSize: "12px", color: "#737373" }}>
                          {claimProgress ?? "Generating ZK proof..."} — Do not close this tab.
                        </p>
                      </div>
                    )}

                    {claimError && (
                      <div style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2" }}>
                        <p style={{ fontSize: "13px", color: "#EF4444" }}>{claimError}</p>
                      </div>
                    )}

                    <button
                      onClick={handleClaim}
                      disabled={claimBusy || !noteInput.trim() || !address}
                      style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: claimBusy ? "not-allowed" : "pointer", opacity: (claimBusy || !noteInput.trim()) ? 0.5 : 1 }}
                    >
                      {claimBusy
                        ? (claimStatus || "Processing...")
                        : "Generate Proof & Withdraw"}
                    </button>
                  </>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Personal Link */}
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
            <div>
              <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#171717", marginBottom: "2px" }}>Your Personal Link</h2>
              <p style={{ fontSize: "13px", color: "#525252" }}>Share to get paid</p>
            </div>
            <button style={{ padding: "6px 12px", border: "1px solid #E5E5E5", borderRadius: "8px", fontSize: "12px", fontWeight: 600, color: "#404040", background: "white", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
              <Icon icon="ph:pencil-simple-bold" /> Edit Profile
            </button>
          </div>

          <div style={{ background: "#FAFAFA", borderRadius: "12px", padding: "16px", border: "1px solid #E5E5E5", display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "white", fontSize: "18px" }}>CR</div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0A0A0A" }}>@creator</div>
              <div style={{ fontSize: "13px", color: "#737373" }}>growthip.vercel.app/tip/creator</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={copyLink} style={{ flex: 1, background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "12px", padding: "10px", fontSize: "13px", fontWeight: 600, color: "#171717", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Icon icon="ph:copy-simple-bold" style={{ fontSize: "18px" }} />
              {copied ? "Copied!" : "Copy Link"}
            </button>
            {[
              { icon: "ph:share-network-bold" },
              { icon: "ph:qr-code-bold" },
              { icon: "ph:arrow-square-out-bold" },
            ].map(({ icon }) => (
              <button key={icon} style={{ width: 48, height: 44, background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#404040" }}>
                <Icon icon={icon} style={{ fontSize: "18px" }} />
              </button>
            ))}
          </div>
        </Card>



      {showWalletModal && (
        <WalletModal
          onClose={() => setShowWalletModal(false)}
          onSelectFreighter={async () => {
            setShowWalletModal(false);
            await connectWallet();
          }}
          connecting={walletBusy}
        />
      )}
      </div>
    </div>
  );
}