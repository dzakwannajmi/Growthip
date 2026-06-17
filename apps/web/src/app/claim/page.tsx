"use client";

/**
 * claim/page.tsx — Private claim flow (Growthip V3).
 *
 * Steps:
 *   1. Load the PrivateNote (paste).
 *   2. Fetch all commitments from the contract (get_commitment per index).
 *   3. Rebuild the depth-3 Merkle tree and derive the path for the note's leaf.
 *   4. Generate the Groth16 proof in the browser (5–15s, with progress).
 *   5. Submit proof + public inputs via client.claim_to.
 *
 * Integration: uses the generated growthipPoolClient.ts. The claim_to method
 * signature is: claim_to({ recipient, proof_bytes: Buffer, public_inputs: Buffer[] }).
 * Read-only reads (total_deposits / get_commitment) use the simulated result.
 */

import { useCallback, useMemo, useState } from "react";
import {
  isConnected,
  requestAccess,
  signTransaction,
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
import type { PrivateNote } from "@/lib/note";

import { Client, networks } from "@/lib/growthipPoolClient";

type Stage =
  | "idle"
  | "connecting"
  | "loading-pool"
  | "building-tree"
  | "proving"
  | "submitting"
  | "done"
  | "error";

const RPC_URL = "https://soroban-testnet.stellar.org";

const PROGRESS_LABEL: Record<ProofProgress, string> = {
  "loading-wasm": "Memuat sirkuit ZK…",
  "computing-witness": "Menghitung witness…",
  "generating-proof": "Membuat zero-knowledge proof…",
  serializing: "Menyusun proof…",
  done: "Proof siap",
};

/** Normalize a contract commitment (Buffer from scValToNative) to decimal. */
function commitmentToDecimal(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return hexToDecimal(raw);
  return bytesToDecimal(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

export default function ClaimPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [noteJson, setNoteJson] = useState("");
  const [recipient, setRecipient] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<ProofProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const busy = useMemo(
    () => ["connecting", "loading-pool", "building-tree", "proving", "submitting"].includes(stage),
    [stage],
  );

  const handleConnect = useCallback(async () => {
    setError(null);
    setStage("connecting");
    try {
      const { isConnected: hasFreighter } = await isConnected();
      if (!hasFreighter) throw new Error("Freighter tidak terdeteksi.");
      const access = await requestAccess();
      if (access.error) throw new Error(access.error);
      setAddress(access.address);
      if (!recipient) setRecipient(access.address);
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal connect wallet.");
      setStage("error");
    }
  }, [recipient]);

  const buildClient = useCallback(
    (publicKey: string) =>
      new Client({
        ...networks.testnet,
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const res = await signTransaction(xdr, {
            networkPassphrase: networks.testnet.networkPassphrase,
            address: publicKey,
          });
          if (res.error) throw new Error(res.error);
          return { signedTxXdr: res.signedTxXdr, signerAddress: publicKey };
        },
      }),
    [],
  );

  const parseNote = useCallback((): PrivateNote => {
    let note: PrivateNote;
    try {
      note = JSON.parse(noteJson) as PrivateNote;
    } catch {
      throw new Error("Private Note bukan JSON yang valid.");
    }
    if (note.version !== "growthip-v3") {
      throw new Error(`Versi note tidak didukung: ${note.version}`);
    }
    if (!note.secret || !note.nullifier || !note.recipientHash) {
      throw new Error("Note tidak lengkap (secret/nullifier/recipientHash hilang).");
    }
    if (note.claimed) throw new Error("Note ini sudah pernah diklaim.");
    return note;
  }, [noteJson]);

  const handleClaim = useCallback(async () => {
    if (!address) {
      setError("Hubungkan wallet terlebih dahulu.");
      return;
    }
    setError(null);
    setTxHash(null);

    try {
      const note = parseNote();
      const client = buildClient(address);

      // 1. Fetch all commitments (read-only via simulation).
      setStage("loading-pool");
      const totalTx = await client.total_deposits();
      const total = Number(totalTx.result);
      if (total === 0) throw new Error("Pool kosong — belum ada deposit.");
      if (total > MAX_LEAVES) {
        throw new Error(
          `Pool penuh (${total}/${MAX_LEAVES}). Tree depth 3 hanya mendukung ${MAX_LEAVES} deposit. ` +
            "Hubungi tim untuk konfigurasi pool yang lebih besar.",
        );
      }

      const commitments: string[] = [];
      for (let i = 0; i < total; i++) {
        const cTx = await client.get_commitment({ index: i });
        commitments.push(commitmentToDecimal(cTx.result as Buffer));
      }

      // Locate our commitment.
      const noteCommitment = hexToDecimal(note.commitment);
      const leafIndex = commitments.indexOf(noteCommitment);
      if (leafIndex === -1) {
        throw new Error(
          "Commitment dari note tidak ditemukan di pool on-chain. " +
            "Pastikan deposit sudah terkonfirmasi dan note berasal dari pool ini.",
        );
      }

      // 2. Rebuild tree + derive path.
      setStage("building-tree");
      const tree = await buildMerkleTree(commitments);
      const merklePath: MerklePath = getMerklePathByIndex(tree, leafIndex);

      // 3. Generate the proof.
      setStage("proving");
      const generated = await generateProof(note, merklePath, (p) => setProgress(p));

      // 4. Submit via claim_to.
      setStage("submitting");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({
        recipient: recipient || address,
        proof_bytes,
        public_inputs,
      });
      const sent = await claimTx.signAndSend();
      setTxHash(sent.sendTransactionResponse?.hash ?? "submitted");

      // Mark note claimed in storage.
      markNoteClaimed(note.commitment);
      setStage("done");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Klaim gagal.");
      setStage("error");
    } finally {
      setProgress(null);
    }
  }, [address, recipient, parseNote, buildClient]);

  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Claim Tip</h1>
        <p className="text-sm text-muted-foreground">
          Tempel Private Note kamu. Proof dibuat sepenuhnya di browser — secret tidak pernah dikirim ke server.
        </p>
      </header>

      {!address ? (
        <button
          onClick={handleConnect}
          disabled={stage === "connecting"}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {stage === "connecting" ? "Menghubungkan…" : "Connect Wallet"}
        </button>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="note">Private Note (JSON)</label>
            <textarea
              id="note"
              rows={8}
              value={noteJson}
              onChange={(e) => setNoteJson(e.target.value)}
              placeholder='{ "version": "growthip-v3", ... }'
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="recipient">Kirim ke alamat</label>
            <input
              id="recipient"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="G..."
              disabled={busy}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={handleClaim}
            disabled={busy || noteJson.trim().length === 0}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "loading-pool"
              ? "Memuat pool…"
              : stage === "building-tree"
                ? "Menyusun Merkle tree…"
                : stage === "proving"
                  ? progress ? PROGRESS_LABEL[progress] : "Membuat proof…"
                  : stage === "submitting"
                    ? "Mengirim klaim…"
                    : "Generate Proof & Claim"}
          </button>

          {stage === "proving" && (
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                {progress ? PROGRESS_LABEL[progress] : "Memproses…"} Ini bisa memakan waktu 5–15 detik. Jangan tutup tab.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          {stage === "done" && txHash && (
            <div className="space-y-1 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">Klaim berhasil!</p>
              <p className="break-all font-mono text-xs text-muted-foreground">{txHash}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Mark a note as claimed in localStorage. */
function markNoteClaimed(commitmentHex: string): void {
  if (typeof window === "undefined") return;
  const KEY = "growthip:notes";
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return;
  const list: PrivateNote[] = JSON.parse(raw) as PrivateNote[];
  const updated = list.map((n) =>
    n.commitment === commitmentHex ? { ...n, claimed: true, claimedAt: Date.now() } : n,
  );
  window.localStorage.setItem(KEY, JSON.stringify(updated));
}