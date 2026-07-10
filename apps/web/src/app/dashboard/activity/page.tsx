"use client";
import { unwrapCampaignMessage } from "@/lib/campaign";
import { toast } from "sonner";

import { useCallback, useEffect, useState } from "react";
import { Buffer } from "buffer";
import { Icon } from "@iconify/react";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
} from "@stellar/freighter-api";
import {
  getMerklePath,
  hexToDecimal,
  bytesToDecimal,
  MAX_LEAVES,
  type MerklePath,
} from "@/lib/merkle";
import { generateProof, toClaimArgs, type ProofProgress } from "@/lib/zkp";
import {
  getPendingNotes,
  getClaimedNotes,
  saveNote,
  markNoteAsClaimed,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";
import { config } from "@/lib/config";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

type Filter = "all" | "pending" | "withdrawn";
type TokenFilter = "all" | "XLM" | "USDC";
type SortOrder = "newest" | "oldest";
type ClaimStage = "idle" | "loading" | "proving" | "submitting" | "done" | "error";

function formatAmount(note: PrivateNote): string {
  const token = getToken(note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

function commitmentToDecimal(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return hexToDecimal(raw);
  return bytesToDecimal(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

const PROGRESS_LABELS: Record<ProofProgress, string> = {
  "loading-wasm":      "Preparing privacy proof...",
  "computing-witness": "Computing witness...",
  "generating-proof":  "Generating zero-knowledge proof (5-15s)...",
  "serializing":       "Serializing proof...",
  "done":              "Proof ready",
};

const TOKEN_ICONS: Record<string, string> = {
  XLM:  "cryptocurrency-color:xlm",
  USDC: "cryptocurrency-color:usdc",
  EURC: "cryptocurrency-color:eur",
};

export default function ActivityPage() {
  const [filter, setFilter]         = useState<Filter>("all");
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>("all");
  const [sortOrder, setSortOrder]     = useState<SortOrder>("newest");
  const [openDropdown, setOpenDropdown] = useState<"status"|"token"|"sort"|null>(null);
  const [encLocked, setEncLocked]   = useState(false);
  const [unlockPw, setUnlockPw]     = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockErr, setUnlockErr]   = useState("");
  const [pending, setPending]   = useState<PrivateNote[]>([]);
  const [claimed, setClaimed]   = useState<PrivateNote[]>([]);

  // Wallet
  const [address, setAddress]   = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("growthip:wallet") ?? "";
  });
  const [network, setNetwork]   = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("growthip:network") ?? "";
  });
  const isTestnet = network.toUpperCase() === "TESTNET";

  // Claim modal
  const [modalNote, setModalNote]       = useState<PrivateNote | null>(null);
  const [claimStage, setClaimStage]     = useState<ClaimStage>("idle");
  const [claimProgress, setClaimProgress] = useState<ProofProgress | null>(null);
  const [claimStatus, setClaimStatus]   = useState("");
  const [claimError, setClaimError]     = useState("");
  const [claimTxHash, setClaimTxHash]   = useState("");
  const [recipient, setRecipient]       = useState("");

  const [PoolClient, setPoolClient] = useState<null | {
    Client:   typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) =>
      setPoolClient({ Client: mod.Client, networks: mod.networks })
    );
  }, []);

  function loadNotes() {
    if (!address) { setPending([]); setClaimed([]); return; }
    const currentPoolId = process.env.NEXT_PUBLIC_POOL_ID;
    const currentUsdcPoolId = process.env.NEXT_PUBLIC_POOL_USDC_ID;
    const filterByPool = (notes: ReturnType<typeof getPendingNotes>) =>
      notes.filter((n) => {
        if (!n.poolId) return false; // hide legacy notes
        if (n.token === "USDC") return n.poolId === currentUsdcPoolId;
        return n.poolId === currentPoolId;
      });
    setPending(filterByPool(getPendingNotes(address)));
    setClaimed(filterByPool(getClaimedNotes(address)));
  }

  useEffect(() => { loadNotes(); }, [address, claimTxHash]);

  async function fetchOnChainNotes() {
    if (!address || !PoolClient) return;
    try {
      const { decryptIncomingNote, isUnlocked } = await import("@/lib/encryption/keyManagement");
      if (!isUnlocked()) {
        setEncLocked(true);
        return;
      } else {
        setEncLocked(false);
      }
      for (const tokenSymbol of ["XLM", "USDC"] as const) {
        try {
          const client = buildClient(address, tokenSymbol);
          const totalTx = await client.total_deposits();
          const total = Number(totalTx.result ?? 0);
          for (let i = 0; i < total; i++) {
            try {
              const msgTx = await client.get_message({ index: i });
              const msg = msgTx.result;
              if (!msg) continue;
              // Try to decrypt as encrypted bundle
              const { campaignId: taggedCampaignId, bundle } = unwrapCampaignMessage(msg);
              const decrypted = await decryptIncomingNote(bundle).catch(() => null);
              if (!decrypted) continue;
              const note = JSON.parse(new TextDecoder().decode(decrypted));
              if (note.version !== "growthip-v3") continue;
              if (note.recipientAddress !== address) continue;
              // Save with real depositIndex and poolId for filtering.
              const currentPoolId = tokenSymbol === "USDC"
                ? process.env.NEXT_PUBLIC_POOL_USDC_ID
                : process.env.NEXT_PUBLIC_POOL_ID;
              const finalNote = { ...note, depositIndex: i, poolId: currentPoolId };
              saveNote(address, finalNote);
            } catch { /* skip unreadable messages */ }
          }
        } catch { /* skip token if pool not configured */ }
      }
      loadNotes();
    } catch { /* silent fail */ }
  }
  useEffect(() => { fetchOnChainNotes(); }, [address, PoolClient]);
  // Poll for encryption unlock -- fetchOnChainNotes skips if locked.
  // Once unlocked (e.g. user visits Settings and unlocks), re-trigger fetch.
  useEffect(() => {
    if (!address || !PoolClient) return;
    const interval = setInterval(async () => {
      const { isUnlocked } = await import("@/lib/encryption/keyManagement");
      if (isUnlocked()) {
        clearInterval(interval);
        fetchOnChainNotes();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [address, PoolClient]);

  async function connectWallet() {
    try {
      const { connectWalletModal } = await import("@/lib/wallet");
      const addr = await connectWalletModal();
      setAddress(addr);
      setRecipient(addr);
      localStorage.setItem("growthip:wallet", addr);
      setNetwork("TESTNET");
      localStorage.setItem("growthip:network", "TESTNET");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Connection failed.");
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

  function openModal(note: PrivateNote) {
    setModalNote(note);
    setClaimStage("idle");
    setClaimError("");
    setClaimTxHash("");
    setClaimStatus("");
    setClaimProgress(null);
    setRecipient(address);
  }

  function closeModal() {
    setModalNote(null);
    setClaimStage("idle");
  }

  async function handleClaim() {
    if (!address || !isTestnet || !PoolClient || !modalNote) return;
    setClaimError("");
    setClaimTxHash("");
    setClaimStage("loading");

    try {
      const note   = modalNote;
      const client = buildClient(recipient || address, note.token);

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

      setClaimStatus("Verifying your tip note...");
      const { pathElements, pathIndices, leafIndex } = await getMerklePath(hexToDecimal(note.commitment), commitments);
      const merklePath: MerklePath = { pathElements, pathIndices };

      setClaimStage("proving");
      setClaimStatus("Generating ZK proof...");
      const generated = await generateProof(note, merklePath, (p) => setClaimProgress(p));

      setClaimStage("submitting");
      setClaimStatus("Sending claim to blockchain...");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({ recipient: recipient || address, proof_bytes, public_inputs });
      const sent    = await claimTx.signAndSend({ force: true });

      if (sent.result === false) throw new Error("Could not claim this tip. It may already be claimed, or the note doesn't match the current pool. Try refreshing.");

      const hash = sent.sendTransactionResponse?.hash ?? "submitted";
      setClaimTxHash(hash);
      // Use note.recipientAddress (creator namespace) if available,
      // fall back to connected address for legacy notes.
      markNoteAsClaimed(note.recipientAddress ?? address, note.nullifierHash, hash);
      setClaimStage("done");
      toast.success("Tip claimed!", { description: "Funds have been transferred to your wallet." });
      loadNotes();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Claim failed.";
      setClaimError(message);
      setClaimStage("error");
      toast.error("Claim failed", { description: message });
    } finally {
      setClaimProgress(null);
    }
  }

  const baseNotes = filter === "all"
    ? [...claimed, ...pending]
    : filter === "pending"
    ? [...pending]
    : [...claimed];
  const tokenFiltered = tokenFilter === "all"
    ? baseNotes
    : baseNotes.filter((n) => n.token === tokenFilter);
  const notes = tokenFiltered.sort((a, b) => {
    const aTime = a.claimedAt ?? a.timestamp;
    const bTime = b.claimedAt ?? b.timestamp;
    return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
  });

  return (
    <div className="bg-[#FAFAFA] dark:bg-[#0A0A0A]" style={{ padding: "32px", minHeight: "100%" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div>
          <h1 className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "24px", fontWeight: 800 }}>Activity</h1>
          <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px", marginTop: "4px" }}>Your tip transaction history</p>
        </div>

        {/* Unlock banner */}
        {encLocked && (
          <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl flex flex-col gap-2.5" style={{ padding: "16px 20px" }}>
            <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>🔐 Unlock encryption to see pending tips</p>
            <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px" }}>Enter your encryption password to auto-fetch incoming tips from the pool.</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="password"
                placeholder="Encryption password..."
                value={unlockPw}
                onChange={(e) => setUnlockPw(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter" || unlockBusy) return;
                  setUnlockBusy(true);
                  try {
                    const { unlockWithPassword } = await import("@/lib/encryption/keyManagement");
                    await unlockWithPassword(unlockPw);
                    setEncLocked(false);
                    setUnlockErr("");
                    fetchOnChainNotes();
                  } catch { setUnlockErr("Wrong password."); } finally { setUnlockBusy(false); }
                }}
                className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", fontSize: "13px", outline: "none" }}
              />
              <button
                disabled={unlockBusy || !unlockPw.trim()}
                onClick={async () => {
                  setUnlockBusy(true);
                  try {
                    const { unlockWithPassword } = await import("@/lib/encryption/keyManagement");
                    await unlockWithPassword(unlockPw);
                    setEncLocked(false);
                    setUnlockErr("");
                    fetchOnChainNotes();
                  } catch { setUnlockErr("Wrong password."); } finally { setUnlockBusy(false); }
                }}
                style={{ padding: "10px 16px", borderRadius: "10px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: unlockBusy ? "not-allowed" : "pointer", opacity: unlockBusy || !unlockPw.trim() ? 0.5 : 1 }}
              >
                {unlockBusy ? "Unlocking..." : "Unlock"}
              </button>
            </div>
            {unlockErr && <p style={{ fontSize: "12px", color: "#EF4444" }}>{unlockErr}</p>}
          </div>
        )}
        {/* Filter */}
        <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl" style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700 }}>
              <Icon icon="ph:funnel-bold" style={{ fontSize: "16px" }} />
              FILTER
            </div>
            <div className="bg-[#E5E5E5] dark:bg-[#2A2A2A]" style={{ width: "1px", height: "20px" }} />

            {/* Status custom dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                className={filter !== "all" ? "bg-[#0A0A0A] text-white" : "bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5]"}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                {filter === "all" ? "All Status" : filter === "pending" ? `Pending (${pending.length})` : `Withdrawn (${claimed.length})`}
                <Icon icon="ph:caret-down-bold" style={{ fontSize: "11px", opacity: 0.6 }} />
              </button>
              {openDropdown === "status" && (
                <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-[14px] flex flex-col gap-0.5" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 50, minWidth: "180px", padding: "6px" }}>
                  {(["all", "pending", "withdrawn"] as Filter[]).map((f) => (
                    <button key={f} onClick={() => { setFilter(f); setOpenDropdown(null); }}
                      className={["text-[#171717] dark:text-[#E5E5E5]", filter === f ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: filter === f ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      {f === "all" ? "All Status" : f === "pending" ? `Pending (${pending.length})` : `Withdrawn (${claimed.length})`}
                      {filter === f && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Token custom dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setOpenDropdown(openDropdown === "token" ? null : "token")}
                className={tokenFilter !== "all" ? "bg-[#0A0A0A] text-white" : "bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5]"}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                {tokenFilter === "all" ? "All Tokens" : tokenFilter}
                <Icon icon="ph:caret-down-bold" style={{ fontSize: "11px", opacity: 0.6 }} />
              </button>
              {openDropdown === "token" && (
                <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-[14px] flex flex-col gap-0.5" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 50, minWidth: "180px", padding: "6px" }}>
                  {(["all", "XLM", "USDC"] as TokenFilter[]).map((t) => (
                    <button key={t} onClick={() => { setTokenFilter(t); setOpenDropdown(null); }}
                      className={["text-[#171717] dark:text-[#E5E5E5]", tokenFilter === t ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: tokenFilter === t ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      {t === "all" ? "All Tokens" : t}
                      {tokenFilter === t && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                    </button>
                  ))}
                  <div className="border-t border-[#F5F5F5] dark:border-[#232323]" style={{ margin: "4px 0" }} />
                  <button disabled className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "transparent", border: "none", cursor: "not-allowed", textAlign: "left", width: "100%" }}>
                    EURC
                    <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "6px" }}>Soon</span>
                  </button>
                </div>
              )}
            </div>

            {/* Sort custom dropdown */}
            <div style={{ position: "relative", marginLeft: "auto" }}>
              <button
                onClick={() => setOpenDropdown(openDropdown === "sort" ? null : "sort")}
                className="bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5]"
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}
              >
                {sortOrder === "newest" ? "Newest first" : "Oldest first"}
                <Icon icon="ph:caret-down-bold" style={{ fontSize: "11px", opacity: 0.6 }} />
              </button>
              {openDropdown === "sort" && (
                <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-[14px] flex flex-col gap-0.5" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 50, minWidth: "160px", padding: "6px" }}>
                  {(["newest", "oldest"] as SortOrder[]).map((s) => (
                    <button key={s} onClick={() => { setSortOrder(s); setOpenDropdown(null); }}
                      className={["text-[#171717] dark:text-[#E5E5E5]", sortOrder === s ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: sortOrder === s ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      {s === "newest" ? "Newest first" : "Oldest first"}
                      {sortOrder === s && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active filter chips */}
          {(filter !== "all" || tokenFilter !== "all") && (
            <div className="border-t border-[#F5F5F5] dark:border-[#232323]" style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px" }}>
              {filter !== "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "12px", fontWeight: 700 }}>
                  {filter === "pending" ? `Pending (${pending.length})` : `Withdrawn (${claimed.length})`}
                  <button onClick={() => setFilter("all")} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "0", display: "flex", alignItems: "center" }}>
                    <Icon icon="ph:x-bold" style={{ fontSize: "12px" }} />
                  </button>
                </div>
              )}
              {tokenFilter !== "all" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "12px", fontWeight: 700 }}>
                  {tokenFilter}
                  <button onClick={() => setTokenFilter("all")} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "0", display: "flex", alignItems: "center" }}>
                    <Icon icon="ph:x-bold" style={{ fontSize: "12px" }} />
                  </button>
                </div>
              )}
              <button onClick={() => { setFilter("all"); setTokenFilter("all"); }} className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#525252] dark:text-[#B0B0B0]" style={{ padding: "4px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 600, border: "none", cursor: "pointer" }}>
                Clear all
              </button>
            </div>
          )}
        </div>
        {/* Notes list */}
        {/* Notes list */}
        {notes.length === 0 ? (
          <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl flex flex-col items-center text-center" style={{ padding: "64px 24px" }}>
            <div className="bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: 64, height: 64, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Icon icon="ph:gift-bold" className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "28px" }} />
            </div>
            <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>No tips yet</p>
            <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px" }}>Send a tip from the Dashboard to get started!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {notes.map((note) => (
              <div key={note.nullifierHash || note.commitment} className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl flex items-center justify-between gap-4" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <Icon icon={TOKEN_ICONS[note.token] || "ph:coin-bold"} style={{ fontSize: "36px", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "15px", fontWeight: 800 }}>{formatAmount(note)}</span>
                      <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px" }}>{note.token}</span>
                    </div>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px", marginTop: "4px" }}>
                      {note.claimed && note.claimedAt ? `Withdrawn ${formatRelativeTime(note.claimedAt)}` : `Deposited ${formatRelativeTime(note.timestamp)}`}
                      
                    </p>
                  </div>
                </div>

                {note.claimed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, padding: "6px 12px", borderRadius: "999px", background: "#F0FDF4", color: "#16a34a", WebkitTextFillColor: "#16a34a" }}>✓ Withdrawn</span>
                    {note.txHash && (
                      <a href={"https://stellar.expert/explorer/testnet/tx/" + note.txHash} target="_blank" rel="noreferrer noopener" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#6366f1", textDecoration: "none" }}>
                        <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} />
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => address ? openModal(note) : connectWallet()}
                    className="bg-[#0A0A0A] text-white"
                    style={{ padding: "8px 16px", borderRadius: "999px", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0 }}
                  >
                    {address ? "Claim →" : "Connect & Claim"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Claim Modal */}
      {modalNote && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
        >
          <div className="bg-white dark:bg-[#1A1A1A]" style={{ borderRadius: "20px", width: "100%", maxWidth: "480px", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            {/* Modal header */}
            <div className="border-b border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800 }}>Claim Tip</h2>
                <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", marginTop: "2px" }}>{formatAmount(modalNote)}</p>
              </div>
              <button onClick={closeModal} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A]" style={{ width: 32, height: 32, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="ph:x-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "14px" }} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {claimStage === "done" ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Icon icon="ph:confetti-bold" style={{ fontSize: "48px", color: "#22c55e" }} />
                  <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "20px", fontWeight: 800, marginTop: "12px" }}>Tip Claimed!</p>
                  <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", marginTop: "4px" }}>ZK proof verified. Funds transferred to your wallet.</p>
                  {claimTxHash && (
                    <a
                      href={"https://stellar.expert/explorer/testnet/tx/" + claimTxHash}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "16px", fontSize: "13px", fontWeight: 600, color: "#6366f1", textDecoration: "none" }}
                    >
                      <Icon icon="ph:arrow-square-out-bold" />
                      View on Stellar Expert
                    </a>
                  )}
                  <button onClick={closeModal} className="bg-[#0A0A0A] text-white" style={{ display: "block", width: "100%", marginTop: "20px", padding: "12px", borderRadius: "12px", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer" }}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Recipient */}
                  <div>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Recipient Wallet</p>
                    <input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="G... (defaults to connected wallet)"
                      disabled={claimStage !== "idle" && claimStage !== "error"}
                      className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", borderRadius: "10px", padding: "10px 12px", outline: "none" }}
                    />
                  </div>

                  {/* What happens */}
                  <div className="bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ borderRadius: "12px", padding: "14px" }}>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Why Growthip is private</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[
                        { icon: "ph:shield-check-bold", text: "Zero-knowledge proof — nobody knows who tipped who" },
                        { icon: "ph:cpu-bold",          text: "Groth16 BN254 verified natively on Stellar Soroban" },
                        { icon: "ph:globe-bold",        text: "Proof generated in browser — secret never leaves device" },
                        { icon: "ph:lock-key-bold",     text: "Nullifier consumed — double-claim impossible" },
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                          <Icon icon={item.icon} style={{ fontSize: "14px", color: "#6366f1", flexShrink: 0, marginTop: "2px" }} />
                          <span className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px" }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar during proving */}
                  {claimStage === "proving" && (
                    <div style={{ background: "#FAF5FF", borderRadius: "12px", border: "1px solid #DDD6FE", padding: "14px" }}>
                      <div className="bg-[#E5E5E5] dark:bg-[#2A2A2A]" style={{ height: "4px", borderRadius: "999px", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{ height: "100%", width: "60%", borderRadius: "999px", background: "#6366f1", animation: "pulse 1.5s infinite" }} />
                      </div>
                      <p style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600 }}>
                        {claimProgress ? PROGRESS_LABELS[claimProgress] : "Generating privacy proof..."} — Please keep this tab open.
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  {claimStatus && claimStage !== "idle" && claimStage !== "proving" && claimStage !== "error" && (
                    <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px" }}>{claimStatus}</p>
                  )}

                  {/* Error */}
                  {claimError && (
                    <div style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #FCA5A5", background: "#FEF2F2" }}>
                      <p style={{ fontSize: "13px", color: "#EF4444" }}>{claimError}</p>
                    </div>
                  )}

                  {/* Fee breakdown */}
                  {claimStage === "idle" && modalNote && (
                    <div className="bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#737373] dark:text-[#8A8A8A]" style={{ padding: "12px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px", marginBottom: "8px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Platform fee (1%)</span>
                        <span>~{(Number(modalNote.amount) / 1e7 * 0.01).toFixed(2)} {modalNote.token}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Est. network fee</span>
                        <span>~0.022 XLM</span>
                      </div>
                      <div className="text-[#0A0A0A] dark:text-[#F5F5F5] border-t border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: "4px", marginTop: "2px" }}>
                        <span>You receive</span>
                        <span>~{(Number(modalNote.amount) / 1e7 * 0.99).toFixed(2)} {modalNote.token}</span>
                      </div>
                    </div>
                  )}
                  {/* Claim button */}
                  <button
                    onClick={handleClaim}
                    disabled={claimStage !== "idle" && claimStage !== "error"}
                    className="bg-[#0A0A0A] text-white"
                    style={{
                      width: "100%", padding: "14px", borderRadius: "12px",
                      fontSize: "14px",
                      fontWeight: 700, border: "none",
                      cursor: (claimStage !== "idle" && claimStage !== "error") ? "not-allowed" : "pointer",
                      opacity: (claimStage !== "idle" && claimStage !== "error") ? 0.6 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                  >
                    {claimStage === "idle" || claimStage === "error" ? (
                      <><Icon icon="ph:lock-key-open-bold" style={{ fontSize: "18px" }} /> Generate Proof & Claim</>
                    ) : (
                      <><Icon icon="svg-spinners:ring-resize" style={{ fontSize: "18px" }} /> {claimStatus || "Processing..."}</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}