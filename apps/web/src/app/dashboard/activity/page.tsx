"use client";

import { useCallback, useEffect, useState } from "react";
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
  buildMerkleTree,
  getMerklePathByIndex,
  hexToDecimal,
  bytesToDecimal,
  MAX_LEAVES,
  type MerklePath,
} from "@/lib/merkle";
import { generateProof, toClaimArgs, type ProofProgress } from "@/lib/zkp";
import {
  getPendingNotes,
  getClaimedNotes,
  markNoteAsClaimed,
  formatRelativeTime,
  type PrivateNote,
} from "@/lib/note";
import { getToken } from "@/lib/tokens";
import { config } from "@/lib/config";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

type Filter = "all" | "pending" | "withdrawn";
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
  "loading-wasm":      "Loading ZK circuit...",
  "computing-witness": "Computing witness...",
  "generating-proof":  "Generating Groth16 proof...",
  "serializing":       "Serializing proof...",
  "done":              "Proof ready",
};

export default function ActivityPage() {
  const [filter, setFilter]     = useState<Filter>("all");
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
    setPending(getPendingNotes(address));
    setClaimed(getClaimedNotes(address));
  }

  useEffect(() => { loadNotes(); }, [address, claimTxHash]);

  async function connectWallet() {
    try {
      const conn = await isConnected();
      if (!conn.isConnected) { alert("Freighter not installed."); return; }
      await setAllowed();
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      setAddress(access.address);
      setRecipient(access.address);
      localStorage.setItem("growthip:wallet", access.address);
      const net = await getNetwork();
      setNetwork(net.network ?? "");
      localStorage.setItem("growthip:network", net.network ?? "");
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
          const signed = await freighterSign(xdr, { address: publicKey, networkPassphrase: NETWORK_PASSPHRASE });
          if (signed.error) throw new Error(String(signed.error));
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

      const leafIndex = commitments.indexOf(hexToDecimal(note.commitment));
      if (leafIndex === -1) throw new Error("Commitment not found in pool.");

      setClaimStatus("Building Merkle tree...");
      const tree: Awaited<ReturnType<typeof buildMerkleTree>> = await buildMerkleTree(commitments);
      const merklePath: MerklePath = getMerklePathByIndex(tree, leafIndex);

      setClaimStage("proving");
      setClaimStatus("Generating ZK proof...");
      const generated = await generateProof(note, merklePath, (p) => setClaimProgress(p));

      setClaimStage("submitting");
      setClaimStatus("Submitting proof...");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({ recipient: recipient || address, proof_bytes, public_inputs });
      const sent    = await claimTx.signAndSend({ force: true });

      if (sent.result === false) throw new Error("Claim rejected by contract.");

      const hash = sent.sendTransactionResponse?.hash ?? "submitted";
      setClaimTxHash(hash);
      // Use note.recipientAddress (creator namespace) if available,
      // fall back to connected address for legacy notes.
      markNoteAsClaimed(note.recipientAddress ?? address, note.nullifierHash, hash);
      setClaimStage("done");
      loadNotes();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Claim failed.");
      setClaimStage("error");
    } finally {
      setClaimProgress(null);
    }
  }

  const notes = filter === "all"
    ? [...claimed, ...pending].sort((a, b) => b.timestamp - a.timestamp)
    : filter === "pending"
    ? [...pending].sort((a, b) => b.timestamp - a.timestamp)
    : [...claimed].sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0));

  return (
    <div style={{ padding: "32px", background: "#FAFAFA", minHeight: "100%" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Activity</h1>
          <p style={{ fontSize: "14px", color: "#737373", marginTop: "4px" }}>Your tip transaction history</p>
        </div>

        {/* Filter */}
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "12px 16px", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#A3A3A3", paddingRight: "16px", borderRight: "1px solid #E5E5E5" }}>
            <Icon icon="ph:funnel-bold" style={{ fontSize: "16px" }} />
            FILTER
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(["all", "pending", "withdrawn"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: filter === f ? 700 : 500, background: filter === f ? "#0A0A0A" : "transparent", color: filter === f ? "white" : "#525252", border: "none", cursor: "pointer", transition: "all 0.15s" }}>
                {f === "all" ? "All Tips" : f === "pending" ? `Pending (${pending.length})` : `Withdrawn (${claimed.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* Notes list */}
        {notes.length === 0 ? (
          <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "64px 24px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#F5F5F5", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <Icon icon="ph:gift-bold" style={{ fontSize: "28px", color: "#A3A3A3" }} />
            </div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A", marginBottom: "4px" }}>No tips yet</p>
            <p style={{ fontSize: "13px", color: "#737373" }}>Send a tip from the Dashboard to get started!</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {notes.map((note) => (
              <div key={note.nullifierHash || note.commitment} style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: note.claimed ? "#F0FDF4" : "#FAFAFA", border: `1px solid ${note.claimed ? "#BBF7D0" : "#E5E5E5"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon icon={note.claimed ? "ph:check-circle-bold" : "ph:clock-bold"} style={{ fontSize: "20px", color: note.claimed ? "#22c55e" : "#A3A3A3" }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 800, color: "#0A0A0A" }}>{formatAmount(note)}</span>
                      <span style={{ fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#525252" }}>{note.token}</span>
                    </div>
                    <p style={{ fontSize: "12px", color: "#A3A3A3", marginTop: "4px" }}>
                      {note.claimed && note.claimedAt ? `Withdrawn ${formatRelativeTime(note.claimedAt)}` : `Deposited ${formatRelativeTime(note.timestamp)}`}
                      {note.depositIndex !== undefined && <span style={{ marginLeft: "8px" }}>· Index #{note.depositIndex}</span>}
                    </p>
                  </div>
                </div>

                {note.claimed ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, padding: "6px 12px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>✓ Withdrawn</span>
                    {note.txHash && (
                      <a href={"https://stellar.expert/explorer/testnet/tx/" + note.txHash} target="_blank" rel="noreferrer noopener" style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 600, color: "#6366f1", textDecoration: "none" }}>
                        <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} />
                      </a>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => address ? openModal(note) : connectWallet()}
                    style={{ padding: "8px 16px", borderRadius: "999px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", flexShrink: 0 }}
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
          <div style={{ background: "white", borderRadius: "20px", width: "100%", maxWidth: "480px", overflow: "hidden", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
            {/* Modal header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #E5E5E5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: "16px", fontWeight: 800, color: "#0A0A0A" }}>Claim Tip</h2>
                <p style={{ fontSize: "13px", color: "#737373", marginTop: "2px" }}>{formatAmount(modalNote)} · Index #{modalNote.depositIndex}</p>
              </div>
              <button onClick={closeModal} style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #E5E5E5", background: "#FAFAFA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon icon="ph:x-bold" style={{ fontSize: "14px", color: "#525252" }} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
              {claimStage === "done" ? (
                <div style={{ textAlign: "center", padding: "24px 0" }}>
                  <Icon icon="ph:confetti-bold" style={{ fontSize: "48px", color: "#22c55e" }} />
                  <p style={{ fontSize: "20px", fontWeight: 800, color: "#0A0A0A", marginTop: "12px" }}>Tip Claimed!</p>
                  <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>ZK proof verified. Funds transferred to your wallet.</p>
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
                  <button onClick={closeModal} style={{ display: "block", width: "100%", marginTop: "20px", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer" }}>
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Recipient */}
                  <div>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Recipient Wallet</p>
                    <input
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder="G... (defaults to connected wallet)"
                      disabled={claimStage !== "idle" && claimStage !== "error"}
                      style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", color: "#0A0A0A", background: "#FAFAFA", border: "1px solid #E5E5E5", borderRadius: "10px", padding: "10px 12px", outline: "none" }}
                    />
                  </div>

                  {/* What happens */}
                  <div style={{ background: "#FAFAFA", borderRadius: "12px", border: "1px solid #E5E5E5", padding: "14px" }}>
                    <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "10px" }}>Why Growthip is private</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {[
                        { icon: "ph:shield-check-bold", text: "Zero-knowledge proof — nobody knows who tipped who" },
                        { icon: "ph:cpu-bold",          text: "Groth16 BN254 verified natively on Stellar Soroban" },
                        { icon: "ph:globe-bold",        text: "Proof generated in browser — secret never leaves device" },
                        { icon: "ph:lock-key-bold",     text: "Nullifier consumed — double-claim impossible" },
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                          <Icon icon={item.icon} style={{ fontSize: "14px", color: "#6366f1", flexShrink: 0, marginTop: "2px" }} />
                          <span style={{ fontSize: "12px", color: "#525252" }}>{item.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Progress bar during proving */}
                  {claimStage === "proving" && (
                    <div style={{ background: "#FAF5FF", borderRadius: "12px", border: "1px solid #DDD6FE", padding: "14px" }}>
                      <div style={{ height: "4px", borderRadius: "999px", background: "#E5E5E5", overflow: "hidden", marginBottom: "8px" }}>
                        <div style={{ height: "100%", width: "60%", borderRadius: "999px", background: "#6366f1", animation: "pulse 1.5s infinite" }} />
                      </div>
                      <p style={{ fontSize: "12px", color: "#6366f1", fontWeight: 600 }}>
                        {claimProgress ? PROGRESS_LABELS[claimProgress] : "Generating ZK proof..."} — Do not close this tab.
                      </p>
                    </div>
                  )}

                  {/* Status */}
                  {claimStatus && claimStage !== "idle" && claimStage !== "proving" && claimStage !== "error" && (
                    <p style={{ fontSize: "12px", color: "#737373" }}>{claimStatus}</p>
                  )}

                  {/* Error */}
                  {claimError && (
                    <div style={{ padding: "12px 16px", borderRadius: "10px", border: "1px solid #FCA5A5", background: "#FEF2F2" }}>
                      <p style={{ fontSize: "13px", color: "#EF4444" }}>{claimError}</p>
                    </div>
                  )}

                  {/* Claim button */}
                  <button
                    onClick={handleClaim}
                    disabled={claimStage !== "idle" && claimStage !== "error"}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "12px",
                      background: "#0A0A0A", color: "white", fontSize: "14px",
                      fontWeight: 700, border: "none",
                      cursor: (claimStage !== "idle" && claimStage !== "error") ? "not-allowed" : "pointer",
                      opacity: (claimStage !== "idle" && claimStage !== "error") ? 0.6 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    }}
                  >
                    {claimStage === "idle" || claimStage === "error" ? (
                      <><Icon icon="ph:lock-key-open-bold" style={{ fontSize: "18px" }} /> Generate Proof & Claim</>
                    ) : (
                      <><Icon icon="ph:spinner-bold" style={{ fontSize: "18px", animation: "spin 1s linear infinite" }} /> {claimStatus || "Processing..."}</>
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