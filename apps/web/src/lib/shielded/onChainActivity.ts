"use client";

/**
 * onChainActivity.ts
 *
 * Shared on-chain activity scanner for pool-v5, used by BOTH the Activity
 * page and the Analytics page so "pending vs withdrawn" status never
 * diverges between the two (Analytics is a rollup of Activity's data, not
 * an independent source -- confirmed with Najmi in chat).
 *
 * For each token (XLM, USDC): scans NewCommitment events on the pool-v5
 * contract, trial-decrypts each against the caller's shielded keys, then
 * for every note that decrypts successfully, computes its nullifier the
 * same way buildWithdrawInput() does (tipFlow.ts) and checks
 * is_nullifier_spent() on-chain -- so "Withdrawn" reflects real contract
 * state, not just what THIS browser remembers claiming.
 *
 * Local storage (via saveNote/markNoteAsClaimed) is used purely as a
 * render cache -- callers should invoke this on every page load so the
 * cache is refreshed from the chain each time, not read once and trusted.
 */

import { config } from "@/lib/config";
import { saveNote, markNoteAsClaimed, type PrivateNote } from "@/lib/note";
import { scanForGrNotes } from "@/lib/shielded/grNoteScan";
import { noteCommitment } from "@/lib/shielded/tipFlow";
import { poseidon2, DOM, diversifiedKey, type ShieldedKeys } from "@/lib/shielded";
import { Client as PoolV5Client, networks as poolV5Networks } from "@/lib/poolV5Bindings";

const RPC_URL = config.network.rpcUrl;

function poolV5ContractId(token: "XLM" | "USDC"): string {
  return token === "USDC"
    ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "")
    : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || poolV5Networks.testnet.contractId);
}

export async function scanOnChainActivity(
  address: string,
  token: "XLM" | "USDC",
  keys: ShieldedKeys,
): Promise<void> {
  const contractId = poolV5ContractId(token);
  if (!contractId) return;

  const discovered = await scanForGrNotes(contractId, keys.ivk);
  if (discovered.length === 0) return;

  const client = new PoolV5Client({
    ...poolV5Networks.testnet,
    contractId,
    rpcUrl: RPC_URL,
    publicKey: address,
  });

  for (const d of discovered) {
    try {
      // Bug (found during this session): BigInt fields cannot survive
      // JSON.stringify (used by saveNotes -> localStorage). Every raw V5
      // field below is converted to a string/array BEFORE it touches
      // localStorage, unlike the old code's `v5_raw: note` which silently
      // failed to save (swallowed by the surrounding try/catch).
      // Recompute pkD from THIS note's own diversifier, not keys.pkD
      // (which is only valid for keys.d / DEFAULT_DIVERSIFIER). Matches the
      // approach dashboard/page.tsx's proven claim flow already uses --
      // assuming keys.pkD applies to every note would be wrong if a note's
      // diversifier ever differs from the identity's default one.
      const notePkD = await diversifiedKey(keys.ivk, d.diversifier);
      const commitment = await noteCommitment(d.amount, notePkD, d.blinding);
      const nullifier = await poseidon2([commitment, BigInt(d.leafIndex), keys.nkFold], DOM.NULLIFIER);

      let spent = false;
      try {
        const spentTx = await client.is_nullifier_spent({ nullifier });
        spent = spentTx.result === true;
      } catch {
        // Kalau pengecekan gagal (mis. RPC bermasalah), anggap belum
        // diklaim -- lebih aman tampil "Pending" (masih bisa dicoba klaim)
        // daripada salah menyembunyikan tip yang sebenarnya belum diambil.
        spent = false;
      }

      const nullifierHex = nullifier.toString(16).padStart(64, "0");
      const commitmentHex = commitment.toString(16).padStart(64, "0");

      const note: PrivateNote = {
        version: "growthip-v3",
        secret: "",
        nullifier: "",
        recipientHash: "",
        commitment: commitmentHex,
        nullifierHash: nullifierHex,
        root: "0".padStart(64, "0"),
        token,
        amount: d.amount.toString(),
        timestamp: Date.now(),
        depositIndex: d.leafIndex,
        claimed: spent,
        recipientAddress: address,
        poolId: contractId,
        v5_raw: {
          amount: d.amount.toString(),
          blinding: d.blinding.toString(),
          d: Array.from(d.diversifier),
          leafIndex: d.leafIndex,
          commitment: commitmentHex,
          nullifier: nullifierHex,
        },
      } as unknown as PrivateNote;

      saveNote(address, note);
      if (spent) markNoteAsClaimed(address, nullifierHex);
    } catch {
      continue;
    }
  }
}

export async function scanAllOnChainActivity(address: string, keys: ShieldedKeys): Promise<void> {
  for (const token of ["XLM", "USDC"] as const) {
    await scanOnChainActivity(address, token, keys);
  }
}
