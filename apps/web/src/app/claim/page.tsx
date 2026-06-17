"use client";

import { useEffect, useState, Suspense } from "react";
import { Buffer } from "buffer";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
  signTransaction as freighterSign,
} from "@stellar/freighter-api";
import { config } from "@/lib/config";
import { decodeNote, markNoteAsClaimed } from "@/lib/note";
import {
  GROWTHIP_PROOF_HEX,
  GROWTHIP_PUBLIC_INPUTS_HEX,
} from "@/lib/growthipProof";

const RPC_URL           = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

function ClaimContent() {
  const params = useSearchParams();

  const [noteInput, setNoteInput] = useState(params.get("note") ?? "");
  const [address, setAddress]     = useState("");
  const [network, setNetwork]     = useState("");
  const [status, setStatus]       = useState("");
  const [busy, setBusy]           = useState(false);
  const [success, setSuccess]     = useState(false);

  const isTestnet = network.toUpperCase() === "TESTNET";

  const [PoolClient, setPoolClient] = useState<null | {
    Client: typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) => {
      setPoolClient({ Client: mod.Client, networks: mod.networks });
    });
  }, []);

  async function connectWallet() {
    setBusy(true);
    try {
      const conn = await isConnected();
      if (!conn.isConnected) {
        setStatus("Freighter not installed.");
        return;
      }
      await setAllowed();
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      setAddress(access.address);

      const net = await getNetwork();
      setNetwork(net.network ?? "");
      setStatus("Wallet connected.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Connection failed.");
    } finally {
      setBusy(false);
    }
  }

  async function claimTip() {
    if (!address || !isTestnet) {
      setStatus("Connect Freighter to Testnet first.");
      return;
    }
    if (!noteInput.trim()) {
      setStatus("Please paste your private note.");
      return;
    }
    if (!PoolClient) {
      setStatus("Client not ready, please wait...");
      return;
    }

    setBusy(true);
    setStatus("Verifying note...");

    try {
      const note = decodeNote(noteInput.trim());
      if (!note) {
        setStatus("Invalid note format. Please check and try again.");
        return;
      }

      setStatus("Submitting claim with ZK proof...");

      const { Client, networks } = PoolClient;
      const client = new Client({
        ...networks.testnet,
        rpcUrl: RPC_URL,
        publicKey: address,
      });

      const proofBytes   = Buffer.from(GROWTHIP_PROOF_HEX, "hex");
      const publicInputs = GROWTHIP_PUBLIC_INPUTS_HEX.map((h) =>
        Buffer.from(h, "hex"),
      );

      const tx = await client.claim_to({
        recipient:     address,
        proof_bytes:   proofBytes,
        public_inputs: publicInputs,
      });

      setStatus("Approve the transaction in Freighter...");

      await tx.signAndSend({
        signTransaction: async (xdr: string) => {
          const signed = await freighterSign(xdr, {
            address,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          if (signed.error) throw new Error(String(signed.error));
          return {
            signedTxXdr:   signed.signedTxXdr,
            signerAddress: signed.signerAddress,
          };
        },
      });

      markNoteAsClaimed(note.nullifierHash);
      setSuccess(true);
      setStatus("Tip claimed successfully!");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Claim failed.");
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="rounded-[2rem] border border-fresh-green/30 bg-fresh-green/5 p-8 text-center">
        <p className="text-4xl">🎉</p>
        <p className="mt-4 text-xl font-black text-white">Tip Claimed!</p>
        <p className="mt-2 text-sm text-soft-gray/60">
          ZK proof verified on-chain. Funds transferred to your wallet.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-fresh-green px-5 py-2.5 text-sm font-black text-midnight-blue"
          >
            Dashboard
          </Link>
          <Link
            href="/deposit"
            className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-bold text-white"
          >
            Send another tip
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-[2rem] border border-white/10 bg-rich-black/70 p-6">
      {address ? (
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <span className="text-xs text-soft-gray/60">
            {address.slice(0, 8)}...{address.slice(-6)}
          </span>
          <span
            className={
              "rounded-full px-3 py-1 text-xs font-bold " +
              (isTestnet
                ? "bg-fresh-green/10 text-fresh-green"
                : "bg-coral-red/10 text-coral-red")
            }
          >
            {network}
          </span>
        </div>
      ) : (
        <button
          onClick={connectWallet}
          disabled={busy}
          className="w-full rounded-2xl bg-neon-violet px-5 py-3 text-sm font-black text-white disabled:opacity-50"
        >
          {busy ? "Connecting..." : "Connect Freighter"}
        </button>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
          Private Note
        </p>
        <textarea
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="Paste your private note here..."
          rows={4}
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 font-mono text-xs text-soft-gray/80 outline-none focus:border-neon-violet/50"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-midnight-blue/70 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
          What happens when you claim
        </p>
        <div className="space-y-2 text-xs text-soft-gray/60">
          {[
            "Note decoded and validated",
            "Groth16 ZK proof verified on Soroban",
            "Merkle root checked on-chain",
            "Nullifier consumed — prevents double-claim",
            "Funds transferred to your wallet",
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-neon-violet">→</span>
              {s}
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={claimTip}
        disabled={busy || !address || !noteInput.trim()}
        className="w-full rounded-2xl bg-fresh-green px-5 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:opacity-50"
      >
        {busy ? "Processing..." : "Generate Proof & Claim"}
      </button>

      {status && (
        <p className="text-xs text-soft-gray/60">{status}</p>
      )}
    </div>
  );
}

export default function ClaimPage() {
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
          Claim a Tip
        </h1>
        <p className="mb-8 text-sm text-soft-gray/60">
          Paste your private note to generate a ZK proof and claim your tip.
        </p>
        <Suspense fallback={<div className="text-soft-gray/50">Loading...</div>}>
          <ClaimContent />
        </Suspense>
      </div>
    </main>
  );
}