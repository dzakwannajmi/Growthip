"use client";
import { toast } from "sonner";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import {
  getMerklePath,
  hexToDecimal,
  type MerklePath,
} from "@/lib/merkle";
import {
  getPendingNotes,
  getClaimedNotes,
  markNoteAsClaimed,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";
import { config } from "@/lib/config";
import {
  proveV5,
  deriveShieldedKeys,
  diversifiedKey,
  getGrSeed,
  unlockGrIdentity,
} from "@/lib/shielded";
import { buildWithdrawInput, noteCommitment } from "@/lib/shielded/tipFlow";
import { scanAllCommitments } from "@/lib/shielded/grNoteScan";
import { scanAllOnChainActivity } from "@/lib/shielded/onChainActivity";
import { Client as PoolV5Client, networks as poolV5Networks } from "@/lib/poolV5Bindings";

const RPC_URL = config.network.rpcUrl;

type Filter = "all" | "pending" | "withdrawn";
type TokenFilter = "all" | "XLM" | "USDC";
type SortOrder = "newest" | "oldest";
type ClaimStage = "idle" | "loading" | "proving" | "submitting" | "done" | "error";

function poolV5ContractId(tokenSymbol: string): string {
  return tokenSymbol === "USDC"
    ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "")
    : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || poolV5Networks.testnet.contractId);
}

/** Maps raw/technical errors to plain-language messages an end user can
 * actually act on. Anything unrecognized falls through to a generic
 * "try again" message rather than surfacing stack traces or contract
 * error codes. */
function toFriendlyClaimError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/nullifier/i.test(raw) && /(spent|used|already)/i.test(raw)) {
    return "This tip has already been claimed.";
  }
  if (/not (found|visible)/i.test(raw)) {
    return "This tip note hasn't appeared on the network yet. Please try again in a moment.";
  }
  if (/mismatch|invalid.*address/i.test(raw)) {
    return "This note doesn't match your connected wallet.";
  }
  if (/reverted|invalidproof|contract, #/i.test(raw)) {
    return "The network rejected the claim. This tip may already be claimed, or not fully recorded yet -- try refreshing the page.";
  }
  if (/user declined|rejected/i.test(raw)) {
    return "The transaction was cancelled in your wallet.";
  }
  return "Claim failed. Please try again.";
}

function formatAmount(note: PrivateNote): string {
  const token = getToken(note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

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
  const [scanning, setScanning] = useState(false);

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
  const [claimStatus, setClaimStatus]   = useState("");
  const [claimError, setClaimError]     = useState("");
  const [claimTxHash, setClaimTxHash]   = useState("");
  const [recipient, setRecipient]       = useState("");

  function loadNotes() {
    if (!address) { setPending([]); setClaimed([]); return; }
    const currentPoolId = poolV5ContractId("XLM");
    const currentUsdcPoolId = poolV5ContractId("USDC");
    const filterByPool = (notes: ReturnType<typeof getPendingNotes>) =>
      notes.filter((n) => {
        if (!n.poolId) return false; // hide legacy/non-V5 notes
        if (n.token === "USDC") return n.poolId === currentUsdcPoolId;
        return n.poolId === currentPoolId;
      });
    setPending(filterByPool(getPendingNotes(address)));
    setClaimed(filterByPool(getClaimedNotes(address)));
  }

  useEffect(() => { loadNotes(); }, [address, claimTxHash]);

  const refreshOnChainActivity = useCallback(async () => {
    if (!address) return;
    let seed: Uint8Array;
    try {
      seed = getGrSeed();
      setEncLocked(false);
    } catch {
      setEncLocked(true);
      return;
    }
    setScanning(true);
    try {
      const keys = await deriveShieldedKeys(seed);
      await scanAllOnChainActivity(address, keys);
    } catch {
      // Network hiccup or scan issue -- keep showing the last known cache
      // rather than clearing the list; the next refresh will retry.
    } finally {
      setScanning(false);
      loadNotes();
    }
  }, [address]);

  useEffect(() => { refreshOnChainActivity(); }, [refreshOnChainActivity]);

  // Poll for encryption unlock -- refreshOnChainActivity skips if locked.
  // Once unlocked (e.g. user visits Settings and unlocks), re-trigger.
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(async () => {
      try {
        if (getGrSeed()) {
          clearInterval(interval);
          refreshOnChainActivity();
        }
      } catch {
        // Still locked -- keep polling.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [address, refreshOnChainActivity]);

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

  function openModal(note: PrivateNote) {
    setModalNote(note);
    setClaimStage("idle");
    setClaimError("");
    setClaimTxHash("");
    setClaimStatus("");
    setRecipient(address);
  }

  function closeModal() {
    setModalNote(null);
    setClaimStage("idle");
  }

  async function handleClaim() {
    if (!address || !isTestnet || !modalNote) return;
    setClaimError("");
    setClaimTxHash("");
    setClaimStage("loading");

    try {
      const note = modalNote;
      const v5 = (note as any).v5_raw;
      if (!v5) throw new Error("Catatan ini tidak lengkap dan tidak bisa diklaim.");

      setClaimStatus("Loading your private keys...");
      const seed = getGrSeed();
      const keys = await deriveShieldedKeys(seed);

      const cleanAmount = BigInt(v5.amount);
      const cleanBlinding = BigInt(v5.blinding);
      const diversifier = Uint8Array.from(v5.d as number[]);
      const notePkD = await diversifiedKey(keys.ivk, diversifier);
      const calcCommitment = await noteCommitment(cleanAmount, notePkD, cleanBlinding);

      const contractId = poolV5ContractId(note.token);
      const client = new PoolV5Client({
        ...poolV5Networks.testnet,
        contractId,
        rpcUrl: RPC_URL,
        publicKey: address,
      });

      setClaimStatus("Checking tip status on the network...");
      const nullifier = BigInt("0x" + note.nullifierHash);
      const spentTx = await client.is_nullifier_spent({ nullifier });
      if (spentTx.result === true) {
        throw new Error("Tip ini sudah pernah diklaim sebelumnya.");
      }

      setClaimStatus("Searching for the tip note on the network...");
      const MAX_SCAN_RETRIES = 5;
      const SCAN_RETRY_DELAY_MS = 4000;
      let commitments: { index: number; commitment: string }[] = [];
      let foundOnChain = false;
      for (let attempt = 1; attempt <= MAX_SCAN_RETRIES; attempt++) {
        commitments = await scanAllCommitments(contractId);
        if (commitments.some((c) => c.commitment === calcCommitment.toString())) {
          foundOnChain = true;
          break;
        }
        if (attempt < MAX_SCAN_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, SCAN_RETRY_DELAY_MS));
        }
      }
      if (!foundOnChain) {
        throw new Error("This tip note hasn't appeared on the network yet. Please try again in a moment.");
      }

      setClaimStatus("Menyusun jalur verifikasi...");
      const merkleData = await getMerklePath(calcCommitment.toString(), commitments);
      const merklePath: MerklePath = { pathElements: merkleData.pathElements, pathIndices: merkleData.pathIndices };

      const rootRes = await client.current_root();
      const finalRoot = BigInt(rootRes.result.toString());

      setClaimStage("proving");
      setClaimStatus("Menghasilkan bukti privasi (5-15 detik)...");
      const builtWithdraw = await buildWithdrawInput({
        noteAmount: cleanAmount,
        blinding: cleanBlinding,
        keys,
        recipientAddress: recipient || address,
        relayerAddress: address,
        poolCurrentRoot: finalRoot,
        // Bug #9 class fix (same issue as dashboard/page.tsx): domain must
        // match the pool the note actually lives in -- 1 for XLM, 2 for
        // USDC. Was hardcoded to 1n for all tokens here, which would have
        // broken USDC claims in this flow the same way it did in
        // dashboard/page.tsx before that fix.
        domain: note.token === "USDC" ? 2n : 1n,
        merklePathElements: merklePath.pathElements,
        merklePathIndices: merklePath.pathIndices,
        leafIndex: merkleData.leafIndex,
        // Bug #11 fix (same issue as dashboard/page.tsx): circuit
        // reconstructs pk_d from inD internally, so it must be the note's
        // own diversifier, not the wallet's default one.
        noteD: diversifier,
      });

      const { proof } = await proveV5(builtWithdraw.input);

      const be32 = (v: any) => BigInt(v).toString(16).padStart(64, "0");
      const g1Hex = (pi: any) => BigInt(pi[0]).toString(16).padStart(64, "0") + BigInt(pi[1]).toString(16).padStart(64, "0");
      const g2Hex = (pi: any) =>
        BigInt(pi[0][1]).toString(16).padStart(64, "0") +
        BigInt(pi[0][0]).toString(16).padStart(64, "0") +
        BigInt(pi[1][1]).toString(16).padStart(64, "0") +
        BigInt(pi[1][0]).toString(16).padStart(64, "0");

      const input = builtWithdraw.input;
      const ext = builtWithdraw.ext;
      const { Buffer: DynBuffer } = await import("buffer");

      const formattedExt = {
        ext_amount: BigInt((ext as any).extAmount ?? 0n),
        fee: BigInt((ext as any).fee ?? 0n),
        recipient: (ext as any).recipient || recipient || address,
        relayer: (ext as any).relayer || address,
        encrypted_output0: DynBuffer.from((ext as any).encryptedOutput0 || []),
        encrypted_output1: DynBuffer.from((ext as any).encryptedOutput1 || []),
      };
      const formattedProof = {
        a: DynBuffer.from(g1Hex(proof.pi_a), "hex"),
        b: DynBuffer.from(g2Hex(proof.pi_b), "hex"),
        c: DynBuffer.from(g1Hex(proof.pi_c), "hex"),
        public_amount: BigInt((input as any).publicAmount ?? 0n),
        root: BigInt("0x" + be32((input as any).root)),
        ext_data_hash: BigInt("0x" + be32((input as any).extDataHash)),
        input_nullifiers: ((input as any).inputNullifier || []).map((n: any) => BigInt("0x" + be32(n))),
        output_commitments: ((input as any).outputCommitment || []).map((c: any) => BigInt("0x" + be32(c))),
      };

      setClaimStage("submitting");
      setClaimStatus("Submitting claim transaction to the network...");
      const { signTransaction } = await import("@stellar/freighter-api");
      const submitClient = new PoolV5Client({
        ...poolV5Networks.testnet,
        contractId,
        rpcUrl: RPC_URL,
        publicKey: address,
        signTransaction: signTransaction as any,
      });
      const tx = await submitClient.transact({
        proof: formattedProof as any,
        ext: formattedExt as any,
        sender: address,
      });
      const sent = await tx.signAndSend({ force: true });

      if ((sent.result as any) === false || (sent as any).status === "FAILED") {
        throw new Error("Reverted by contract");
      }

      const hash = sent.sendTransactionResponse?.hash ?? "submitted";
      setClaimTxHash(hash);
      markNoteAsClaimed(note.recipientAddress ?? address, note.nullifierHash, hash);
      setClaimStage("done");
      toast.success("Tip claimed!", { description: "Funds have been transferred to your wallet." });
      loadNotes();
    } catch (err) {
      const message = toFriendlyClaimError(err);
      setClaimError(message);
      setClaimStage("error");
      toast.error("Claim failed", { description: message });
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
          <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "14px", marginTop: "4px" }}>
            Your tip transaction history{scanning ? " -- checking the network..." : ""}
          </p>
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
                    await unlockGrIdentity(unlockPw);
                    setEncLocked(false);
                    setUnlockErr("");
                    refreshOnChainActivity();
                  } catch { setUnlockErr("Wrong password."); } finally { setUnlockBusy(false); }
                }}
                className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ flex: 1, padding: "10px 12px", borderRadius: "10px", fontSize: "13px", outline: "none" }}
              />
              <button
                disabled={unlockBusy || !unlockPw.trim()}
                onClick={async () => {
                  setUnlockBusy(true);
                  try {
                    await unlockGrIdentity(unlockPw);
                    setEncLocked(false);
                    setUnlockErr("");
                    refreshOnChainActivity();
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
                  {(["all", "XLM"] as TokenFilter[]).map((t) => (
                    <button key={t} onClick={() => { setTokenFilter(t); setOpenDropdown(null); }}
                      className={["text-[#171717] dark:text-[#E5E5E5]", tokenFilter === t ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: tokenFilter === t ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      {t === "all" ? "All Tokens" : t}
                      {tokenFilter === t && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                    </button>
                  ))}
                  <div className="border-t border-[#F5F5F5] dark:border-[#232323]" style={{ margin: "4px 0" }} />
                  <button disabled className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 500, background: "transparent", border: "none", cursor: "not-allowed", textAlign: "left", width: "100%" }}>
                    USDC
                    <span className="bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "6px" }}>Soon</span>
                  </button>
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
                        {claimStatus || "Menghasilkan bukti privasi..."} — Please keep this tab open.
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
