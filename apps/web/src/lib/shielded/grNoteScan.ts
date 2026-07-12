"use client";

/**
 * grNoteScan.ts
 *
 * On-chain note discovery for gr: scans a pool-v5 contract's
 * `NewCommitment` events (topics=["commitment"], data_format="map" --
 * see contracts/pool-v5/src/lib.rs) and trial-decrypts each
 * `encrypted_output` blob against the caller's `ivk`. A successful
 * decrypt (non-null) means the note belongs to this identity.
 *
 * NOTE: this is genuinely new ground for this codebase -- V4's privacy
 * model shares notes out-of-band (a link/QR the supporter sends
 * directly), it does NOT scan on-chain events at all. There was no
 * existing "fetchOnChainNotes()" pattern to mirror; the getEvents()
 * API usage here was verified against @stellar/stellar-sdk v15's
 * actual documented interface before writing this, not assumed from
 * memory.
 *
 * Stellar RPC only retains events for a bounded recent window (~24h on
 * many public nodes, up to ~7 days max per the RPC spec) -- this is NOT
 * a complete historical scan by itself. For a hackathon demo this is
 * fine (notes discovered shortly after being sent), but a production
 * deployment would need either a persisted "last scanned ledger"
 * cursor (to incrementally ingest without re-scanning) or a proper
 * indexer, matching the same tradeoff Hari 1's handoff already flagged
 * for the (deliberately skipped) indexer question.
 */

import { Server } from "@stellar/stellar-sdk/rpc";
import { nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import { config } from "@/lib/config";
import { tryDecryptNote } from "./noteEncryption";

export interface DiscoveredGrNote {
  commitment: bigint;
  leafIndex: number;
  amount: bigint;
  diversifier: Uint8Array;
  blinding: bigint;
  ledger: number;
}

const EVENTS_PAGE_LIMIT = 100;
/** Stellar RPC's getEvents() rejects startLedger values older than its
 * retention window with an error rather than silently truncating --
 * callers must pass a startLedger within that window. This constant is
 * a fallback lookback distance (~24h at ~5s/ledger) for a first scan
 * with no prior cursor; a real "last scanned ledger" persisted value
 * should be preferred once available. */
const FALLBACK_LOOKBACK_LEDGERS = 17280;

/**
 * Scans `poolContractId`'s NewCommitment events from `startLedger`
 * onward (or a ~24h fallback window if omitted), trial-decrypting each
 * against `ivk`. Returns only the notes that successfully decrypt --
 * everything else is silently skipped (tryDecryptNote() already
 * distinguishes "not mine" from "corrupted" internally by both
 * returning null; from the scanner's perspective there is nothing
 * further to do with either case).
 */
export async function scanForGrNotes(
  poolContractId: string,
  ivk: bigint,
  startLedger?: number,
): Promise<DiscoveredGrNote[]> {
  const server = new Server(config.network.rpcUrl);
  const found: DiscoveredGrNote[] = [];

  let effectiveStart = startLedger;
  if (effectiveStart === undefined) {
    const latest = await server.getLatestLedger();
    effectiveStart = Math.max(1, latest.sequence - FALLBACK_LOOKBACK_LEDGERS);
  }

  const commitmentTopic = nativeToScVal("commitment", { type: "symbol" }).toXDR("base64");

  let cursor: string | undefined;
  for (;;) {
    const request = cursor
      ? {
          cursor,
          filters: [{ type: "contract" as const, contractIds: [poolContractId], topics: [[commitmentTopic]] }],
          limit: EVENTS_PAGE_LIMIT,
        }
      : {
          startLedger: effectiveStart,
          filters: [{ type: "contract" as const, contractIds: [poolContractId], topics: [[commitmentTopic]] }],
          limit: EVENTS_PAGE_LIMIT,
        };

    const page = await server.getEvents(request);

    for (const event of page.events) {
      const data = scValToNative(event.value) as {
        index: number;
        commitment: bigint;
        encrypted_output: Buffer;
      };

      const decrypted = await tryDecryptNote(ivk, new Uint8Array(data.encrypted_output));
      if (decrypted !== null) {
        found.push({
          commitment: BigInt(data.commitment),
          leafIndex: data.index,
          amount: decrypted.amount,
          diversifier: decrypted.d,
          blinding: decrypted.blinding,
          ledger: event.ledger,
        });
      }
    }

    if (page.events.length < EVENTS_PAGE_LIMIT) break;
    cursor = page.cursor;
  }

  return found;
}
