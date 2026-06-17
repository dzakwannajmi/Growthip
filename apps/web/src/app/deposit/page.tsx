"use client";

/**
 * deposit/page.tsx — Private deposit flow (Growthip V3).
 *
 * On deposit we generate a fresh secret + nullifier, derive recipientHash from
 * the connected Stellar address, and compute the V3 commitment
 * = Poseidon(secret, nullifier, recipientHash). The commitment is submitted
 * on-chain; secret/nullifier/recipientHash are persisted ONLY in localStorage.
 *
 * SECURITY: secret/nullifier never leave the browser and are never sent to any
 * server — only the commitment (a hash) goes on-chain.
 *
 * Integration: uses the generated growthipPoolClient.ts (deposit) and
 * @stellar/freighter-api for wallet access. Adjust the `deposit` arg names if
 * your generated client differs (check the Client interface in
 * growthipPoolClient.ts).
 */

import { useCallback, useMemo, useState } from "react";
import {
  isConnected,
  requestAccess,
  signTransaction,
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
import type { PrivateNote } from "@/lib/note";

// Generated Soroban client + network config.
import { Client, networks } from "@/lib/growthipPoolClient";
import { config } from "@/lib/config";

type Token = "XLM" | "USDC" | "EURC";
type Stage = "idle" | "connecting" | "preparing" | "submitting" | "done" | "error";

const RPC_URL = "https://soroban-testnet.stellar.org";

/** Decimal field element -> 0x-prefixed 32-byte hex (for note storage). */
function decimalToHex32(decimal: string): string {
  const hex = BigInt(decimal).toString(16).padStart(64, "0");
  if (hex.length > 64) throw new Error("field element too large");
  return "0x" + hex;
}

export default function DepositPage() {
  const [address, setAddress] = useState<string | null>(null);
  const [token, setToken] = useState<Token>("XLM");
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<PrivateNote | null>(null);

  const connected = address !== null;
  const canSubmit = useMemo(
    () => connected && amount.trim().length > 0 && stage !== "submitting" && stage !== "preparing",
    [connected, amount, stage],
  );

  const handleConnect = useCallback(async () => {
    setError(null);
    setStage("connecting");
    try {
      const { isConnected: hasFreighter } = await isConnected();
      if (!hasFreighter) throw new Error("Freighter tidak terdeteksi. Pasang ekstensi Freighter.");
      const access = await requestAccess();
      if (access.error) throw new Error(access.error);
      setAddress(access.address);
      void warmPoseidon();
      setStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal connect wallet.");
      setStage("error");
    }
  }, []);

  const buildClient = useCallback(
    (publicKey: string) =>
      new Client({
        ...networks.testnet,
        rpcUrl: RPC_URL,
        publicKey,
        // Sign via Freighter; returns signed XDR.
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

  const handleDeposit = useCallback(async () => {
    if (!address) {
      setError("Hubungkan wallet terlebih dahulu.");
      return;
    }
    setError(null);
    setStage("preparing");
    try {
      // 1. Fresh randomness (decimal field elements).
      const secret = generateSecret();
      const nullifier = generateNullifier();

      // 2. recipientHash bound to the connected creator address.
      const recipientHash = await computeRecipientHash(address);

      // 3. V3 commitment binds all three.
      const commitment = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash = await computeNullifierHash(nullifier);
      const commitmentHex = decimalToHex32(commitment);

      // 4. Ensure the recipientHash is registered on-chain BEFORE depositing.
      //    The contract compares the registered hash against the hash exposed
      //    by the claim proof; without this, claim_to will revert (audit L1).
      setStage("submitting");
      const client = buildClient(address);
      const recipientHashBuf = hexToBuffer(decimalToHex32(recipientHash));

      const existing = await client.get_recipient_hash({ recipient: address });
      if (existing.result == null) {
        const regTx = await client.register_recipient({
          recipient: address,
          recipient_hash: recipientHashBuf,
        });
        await regTx.signAndSend();
      }

      // 5. Submit the commitment on-chain via deposit_paid (returns leaf index).
      const tx = await client.deposit_paid({
        depositor: address,
        commitment: hexToBuffer(commitmentHex),
        amount: BigInt(amount),
      });
      const { result } = await tx.signAndSend();
      const depositIndex = Number(result); // u32 leaf index

      // 6. Persist the PrivateNote (localStorage only).
      const newNote: PrivateNote = {
        version: "growthip-v3",
        secret,
        nullifier,
        recipientHash,
        commitment: commitmentHex,
        nullifierHash: decimalToHex32(nullifierHash),
        root: "0x" + "".padStart(64, "0"), // recomputed at claim time
        token,
        amount,
        timestamp: Date.now(),
        depositIndex,
        claimed: false,
      };
      saveNoteToStorage(newNote);
      setNote(newNote);
      setStage("done");
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Deposit gagal.");
      setStage("error");
    }
  }, [address, token, amount, buildClient]);

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Private Deposit</h1>
        <p className="text-sm text-muted-foreground">
          Tip privat ke creator. Secret &amp; nullifier hanya disimpan di browser kamu.
        </p>
      </header>

      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={stage === "connecting"}
          className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {stage === "connecting" ? "Menghubungkan…" : "Connect Wallet"}
        </button>
      ) : (
        <div className="space-y-4">
          <p className="truncate rounded-md bg-muted/40 px-3 py-2 font-mono text-xs text-muted-foreground">
            {address}
          </p>

          <div className="space-y-2">
            <label className="text-sm font-medium">Token</label>
            <div className="grid grid-cols-3 gap-2">
              {(["XLM", "USDC", "EURC"] as Token[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setToken(t)}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm transition",
                    token === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="amount">Jumlah ({token})</label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground">Dalam base units (stroops untuk XLM).</p>
          </div>

          <button
            onClick={handleDeposit}
            disabled={!canSubmit}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "preparing"
              ? "Menyiapkan commitment…"
              : stage === "submitting"
                ? "Mengirim ke jaringan…"
                : "Deposit"}
          </button>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          {stage === "done" && note && (
            <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium text-primary">
                Deposit berhasil. Simpan Private Note ini — tanpa note, dana tidak bisa diklaim.
              </p>
              <textarea
                readOnly
                rows={7}
                value={JSON.stringify(note, null, 2)}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Persist a note to localStorage under a per-commitment key. */
function saveNoteToStorage(note: PrivateNote): void {
  if (typeof window === "undefined") return;
  const KEY = "growthip:notes";
  const raw = window.localStorage.getItem(KEY);
  const list: PrivateNote[] = raw ? (JSON.parse(raw) as PrivateNote[]) : [];
  list.push(note);
  window.localStorage.setItem(KEY, JSON.stringify(list));
}