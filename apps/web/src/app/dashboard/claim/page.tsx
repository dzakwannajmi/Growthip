"use client";
import { Icon } from "@iconify/react";

import { useCallback, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { markNoteAsClaimed } from "@/lib/note";
import type { PrivateNote } from "@/lib/note";
import { Client, networks } from "@/lib/growthipPoolClient";
import { config } from "@/lib/config";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

type Stage =
  | "idle" | "connecting" | "loading-pool"
  | "building-tree" | "proving" | "submitting"
  | "done" | "error";

const PROGRESS_LABELS: Record<ProofProgress, string> = {
  "loading-wasm":      "Loading ZK circuit...",
  "computing-witness": "Computing witness...",
  "generating-proof":  "Generating zero-knowledge proof...",
  "serializing":       "Serializing proof...",
  "done":              "Proof ready",
};

const STAGE_LABELS: Partial<Record<Stage, string>> = {
  "connecting":    "Connecting...",
  "loading-pool":  "Loading pool commitments...",
  "building-tree": "Building Merkle tree...",
  "proving":       "Generating ZK proof...",
  "submitting":    "Submitting proof on-chain...",
};

function commitmentToDecimal(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return hexToDecimal(raw);
  return bytesToDecimal(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

function ClaimContent() {
  const params = useSearchParams();

  const [address, setAddress]   = useState("");
  const [network, setNetwork]   = useState("");
  const [noteInput, setNoteInput] = useState(params.get("note") ?? "");
  const [recipient, setRecipient] = useState("");
  const [stage, setStage]       = useState<Stage>("idle");
  const [progress, setProgress] = useState<ProofProgress | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const [txHash, setTxHash]     = useState<string | null>(null);

  const isTestnet = network.toUpperCase() === "TESTNET";

  const busy = useMemo(
    () => ["connecting","loading-pool","building-tree","proving","submitting"].includes(stage),
    [stage],
  );

  async function connectWallet() {
    setError(null);
    setStage("connecting");
    try {
      const { connectWalletModal } = await import("@/lib/wallet");
      const addr = await connectWalletModal();
      setAddress(addr);
      if (!recipient) setRecipient(addr);
      setNetwork("TESTNET");
      localStorage.setItem("growthip:wallet", addr);
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed.");
      setStage("error");
    }
  }

  const getPoolId = useCallback((tokenSymbol: string): string => {
    if (tokenSymbol === "USDC") return process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId;
    if (tokenSymbol === "EURC") return process.env.NEXT_PUBLIC_POOL_EURC_ID || networks.testnet.contractId;
    return networks.testnet.contractId;
  }, []);

  const buildClient = useCallback(
    (publicKey: string, tokenSymbol: string = "XLM") =>
      new Client({
        ...networks.testnet,
        contractId: getPoolId(tokenSymbol),
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const { signTransaction: walletSign } = await import("@/lib/wallet");
          const signed = await walletSign(xdr, {
            address: publicKey,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      }),
    [getPoolId],
  );

  function parseNote(): PrivateNote {
    const raw = noteInput.trim();
    let note: PrivateNote;
    try {
      note = raw.startsWith("{")
        ? (JSON.parse(raw) as PrivateNote)
        : (JSON.parse(atob(raw)) as PrivateNote);
    } catch {
      throw new Error("Invalid private note format. Please check and try again.");
    }
    if (note.version !== "growthip-v3") throw new Error(`Unsupported note version: ${note.version}`);
    if (!note.secret || !note.nullifier || !note.recipientHash)
      throw new Error("Incomplete note — secret/nullifier/recipientHash missing.");
    if (note.claimed) throw new Error("This note has already been claimed.");
    return note;
  }

  async function handleClaim() {
    if (!address) { setError("Please connect your wallet first."); return; }
    if (!isTestnet) { setError("Please switch Freighter to Stellar Testnet."); return; }
    setError(null);
    setTxHash(null);

    try {
      const note   = parseNote();
      const client = buildClient(address, note.token);

      // 1. Fetch commitments
      setStage("loading-pool");
      const totalTx = await client.total_deposits();
      const total   = Number(totalTx.result);
      if (total === 0) throw new Error("Pool is empty — no deposits found.");
      if (total > MAX_LEAVES) {
        throw new Error(
          `Pool is full (${total}/${MAX_LEAVES}). Max ${MAX_LEAVES} deposits supported. ` +
          "A fresh pool may be needed."
        );
      }

      const commitments: string[] = [];
      for (let i = 0; i < total; i++) {
        const cTx = await client.get_commitment({ index: i });
        commitments.push(commitmentToDecimal(cTx.result as Buffer));
      }

      const noteCommitment = hexToDecimal(note.commitment);
      // 2. Build Merkle tree
      setStage("building-tree");
      const { pathElements, pathIndices, leafIndex } = await getMerklePath(hexToDecimal(note.commitment), commitments);
      const merklePath: MerklePath = { pathElements, pathIndices };

      // 3. Generate ZK proof (5-15s)
      setStage("proving");
      const generated = await generateProof(note, merklePath, (p) => setProgress(p));

      // 4. Submit on-chain
      setStage("submitting");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({
        recipient: recipient || address,
        proof_bytes,
        public_inputs,
      });
      const sent = await claimTx.signAndSend({ force: true });
      const hash = sent.sendTransactionResponse?.hash ?? "submitted";

      // claim_to returns bool — false means verification failed
      const claimResult = sent.result;
      if (claimResult === false) {
        throw new Error(
          "Claim rejected by contract. Possible causes: " +
          "commitment not found in current pool, nullifier already used, " +
          "or proof does not match current Merkle root. " +
          "Try depositing again with a fresh note."
        );
      }

      setTxHash(hash);
      // Use note.recipientAddress (creator namespace) if available,
      // fall back to connected address for legacy notes.
      markNoteAsClaimed(note.recipientAddress ?? address, note.nullifierHash, hash);
      setStage("done");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Claim failed.");
      setStage("error");
    } finally {
      setProgress(null);
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (stage === "done" && txHash) {
    return (
      <div className="rounded-[2rem] border border-fresh-green/30 bg-fresh-green/5 p-8 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-4 text-xl font-black text-white">Tip Claimed!</p>
        <p className="mt-2 text-sm text-soft-gray/60">
          ZK proof verified on-chain. Funds transferred to your wallet.
        </p>
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs text-soft-gray/40">Transaction</p>
          <p className="mt-1 break-all font-mono text-xs text-soft-gray/70">{txHash}</p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/dashboard" className="rounded-full bg-fresh-green px-5 py-2.5 text-sm font-black text-midnight-blue">
            Dashboard
          </Link>
          <Link href="/deposit" className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white">
            Send another tip
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="" style={{ display: "flex", flexDirection: "column", gap: "16px", borderRadius: "16px", border: "1px solid #E5E5E5", background: "white", padding: "24px" }}>
      {/* Wallet connection */}
      {address ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="font-mono text-xs" style={{ color: "#737373" }}>
            {address.slice(0, 8)}...{address.slice(-6)}
          </span>
          <span
            className="rounded-full px-3 py-1 text-xs font-bold"
            style={{ background: isTestnet ? "#F0FDF4" : "#FEF2F2", color: isTestnet ? "#22c55e" : "#EF4444" }}
          >
            {network || "unknown"}
          </span>
        </div>
      ) : (
        <button
          onClick={connectWallet}
          disabled={busy}
          className="w-full px-5 py-3 text-sm font-black disabled:opacity-50" style={{ borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", cursor: "pointer" }}
        >
          {busy ? "Connecting..." : "Connect Freighter"}
        </button>
      )}

      {/* Private note input */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "#A3A3A3" }}>
          Private Note
        </p>
        <textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder='Paste your private note here (JSON or base64)...'
          rows={5}
          disabled={busy}
          className="w-full resize-none px-4 py-3 font-mono text-xs outline-none disabled:opacity-50" style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", color: "#0A0A0A" }}
        />
      </div>

      {/* Recipient address */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: "#A3A3A3" }}>
          Recipient Wallet
        </p>
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="G... (defaults to connected wallet)"
          disabled={busy}
          className="w-full px-4 py-3 font-mono text-xs outline-none disabled:opacity-50" style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", color: "#0A0A0A" }}
        />
      </div>

      {/* What happens */}
      <div className="" style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", padding: "16px" }}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
          What happens when you claim
        </p>
        <div className="space-y-2 text-xs text-soft-gray/60">
          {[
            "Note decoded and validated",
            "Commitments loaded from blockchain",
            "Merkle tree rebuilt locally",
            "Groth16 ZK proof generated in browser (5-15s)",
            "Proof verified natively on Soroban",
            "Nullifier consumed — double-claim prevented forever",
            "Funds transferred to recipient wallet",
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-neon-violet">→</span>
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Fee estimate */}
      <div className="" style={{ borderRadius: "12px", border: "1px solid #E5E5E5", background: "#FAFAFA", padding: "16px" }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
          Fee Estimate
        </p>
        <div className="flex justify-between text-xs">
          <span className="text-soft-gray/60">Groth16 verification (non-refundable)</span>
          <span className="" style={{ color: "#0A0A0A" }}>~0.0042 XLM</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-soft-gray/60">Nullifier storage (non-refundable)</span>
          <span className="" style={{ color: "#0A0A0A" }}>~0.0017 XLM</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-soft-gray/60">ZK proof generation</span>
          <span className="text-fresh-green">Browser-side (free)</span>
        </div>
        <div className="border-t border-white/10 pt-2 flex justify-between text-xs">
          <span className="font-semibold text-white">Total est.</span>
          <span className="font-black text-white">~0.006 XLM</span>
        </div>
        <p className="text-xs text-soft-gray/40">
          Based on actual testnet: 0.0032 XLM charged
        </p>
      </div>

      {/* Proving progress */}
      {stage === "proving" && (
        <div className="" style={{ borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#E5E5E5" }}>
            <div className="h-full w-1/2 animate-pulse rounded-full" style={{ background: "#6366f1" }} />
          </div>
          <p className="text-xs text-soft-gray/70">
            {progress ? PROGRESS_LABELS[progress] : "Processing..."}{" "}
            <span className="" style={{ color: "#A3A3A3" }}>Do not close this tab.</span>
          </p>
        </div>
      )}

      {/* Claim button */}
      <button
        onClick={handleClaim}
        disabled={busy || !address || !noteInput.trim()}
        className="w-full px-5 py-3 text-sm font-black transition disabled:opacity-50" style={{ borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", cursor: "pointer" }}
      >
        {busy
          ? (STAGE_LABELS[stage] ?? "Processing...")
          : "Generate Proof & Claim"}
      </button>

      {/* Error */}
      {error && (
        <div className="" style={{ borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2", padding: "16px" }}>
          <p className="text-sm" style={{ color: "#EF4444" }}>{error}</p>
        </div>
      )}
    </div>
  );
}

export default function ClaimPage() {
  return (
    <main style={{ background: "#FAFAFA", minHeight: "100%" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", padding: "32px 24px" }}>
        <Link href="/" className="mb-6 flex items-center gap-2 text-sm" style={{ color: "#737373" }}>
          Back
        </Link>
        <h1 className="mb-2 text-3xl font-black tracking-tight" style={{ color: "#0A0A0A" }}>
          Claim a Tip
        </h1>
        <p className="mb-8 text-sm" style={{ color: "#737373" }}>
          Paste your private note. The ZK proof is generated entirely in your browser —
          your secret never leaves your device.
        </p>
        <Suspense fallback={<div className="text-soft-gray/50">Loading...</div>}>
          <ClaimContent />
        </Suspense>
      </div>
    </main>
  );
}