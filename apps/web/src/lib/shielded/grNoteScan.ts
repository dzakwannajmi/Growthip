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
/** Safety valve so a pagination bug (or a misbehaving RPC) can never spin
 * forever -- 500 pages * 100 events = 50,000 events, far beyond what a
 * single pool will emit in its retention window. */
const MAX_EVENT_PAGES = 500;
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
  let pageCount = 0;
  for (;;) {
    // Safety valve: bail out after MAX_EVENT_PAGES even if the RPC keeps
    // returning non-empty pages, instead of looping unboundedly.
    if (++pageCount > MAX_EVENT_PAGES) {
      break;
    }
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

    // Do NOT stop just because this page returned fewer events than
    // EVENTS_PAGE_LIMIT. Stellar RPC's getEvents (v1) can scan a bounded
    // ledger range per call and return a short page while more matching
    // events still exist further ahead -- v1 has no `hasMore` flag to
    // signal this. Only a truly EMPTY page means we reached the chain tip.
    if (!page.cursor || page.cursor === cursor) break;
    cursor = page.cursor;
  }

  return found;
}


export async function scanAllCommitments(
  poolContractId: string,
  startLedger?: number,
): Promise<{ index: number; commitment: string }[]> {
  const server = new Server(config.network.rpcUrl);
  const commitments: { index: number; commitment: string }[] = [];

  const commitmentTopic = nativeToScVal("commitment", { type: "symbol" }).toXDR("base64");

  let effectiveStart = startLedger;
  if (effectiveStart === undefined) {
    const latest = await server.getLatestLedger();
    // Adaptive lookback: claim needs to reconstruct the Merkle tree from
    // leaf index 0, so it must scan back as far as the RPC's retention
    // actually allows (up to ~7 days per the Stellar RPC spec), not just
    // the short FALLBACK_LOOKBACK_LEDGERS window scanForGrNotes uses.
    // RPC providers vary in how much history they truly retain, so probe
    // downward from a generous ceiling instead of hardcoding one number
    // that could silently be wrong for this provider.
    const MAX_CLAIM_LOOKBACK_LEDGERS = 100_000; // ~7 days at ~6s/ledger
    let lookback = MAX_CLAIM_LOOKBACK_LEDGERS;
    let resolvedStart = Math.max(1, latest.sequence - FALLBACK_LOOKBACK_LEDGERS);
    while (lookback >= FALLBACK_LOOKBACK_LEDGERS) {
      const candidate = Math.max(1, latest.sequence - lookback);
      try {
        await server.getEvents({
          startLedger: candidate,
          filters: [
            {
              type: "contract" as const,
              contractIds: [poolContractId],
              topics: [[commitmentTopic]],
            },
          ],
          limit: 1,
        });
        resolvedStart = candidate;
        break;
      } catch (err: any) {
        const msg = String(err?.message ?? err);
        if (!/before oldest ledger/i.test(msg)) throw err;
        lookback = Math.floor(lookback / 2);
      }
    }
    effectiveStart = resolvedStart;
  }

  let cursor: string | undefined;
  let pageCount = 0;

  for (;;) {
    // Safety valve: bail out after MAX_EVENT_PAGES even if the RPC keeps
    // returning non-empty pages, instead of looping unboundedly.
    if (++pageCount > MAX_EVENT_PAGES) {
      break;
    }
    const request = cursor
      ? {
          cursor,
          filters: [
            {
              type: "contract" as const,
              contractIds: [poolContractId],
              topics: [[commitmentTopic]],
            },
          ],
          limit: EVENTS_PAGE_LIMIT,
        }
      : {
          startLedger: effectiveStart,
          filters: [
            {
              type: "contract" as const,
              contractIds: [poolContractId],
              topics: [[commitmentTopic]],
            },
          ],
          limit: EVENTS_PAGE_LIMIT,
        };

    const page = await server.getEvents(request);

    for (const event of page.events) {
      const data = scValToNative(event.value) as {
        index: number;
        commitment: bigint;
      };

      commitments.push({
        index: data.index,
        commitment: data.commitment.toString(),
      });
    }

    // Do NOT stop just because this page returned zero (or few) matching
    // events. Stellar RPC's getEvents (v1) scans a BOUNDED ledger range
    // per call and can return an EMPTY page while real events still exist
    // further ahead in the range we asked for -- v1 has no `hasMore` flag,
    // so "0 events" is NOT a reliable "we reached the chain tip" signal
    // once startLedger is far from the tip (as it now is for the claim
    // scan, per the Bug #3 fix -- confirmed by testing: every retry
    // attempt was making exactly ONE getEvents call and bailing out on a
    // 0-event first page, never following the cursor to where the real
    // events actually were). The only reliable stop condition is the
    // cursor itself: keep following it as long as it keeps advancing, and
    // only stop once the RPC stops returning a NEW cursor (truly done) or
    // the MAX_EVENT_PAGES safety valve above kicks in.
    if (!page.cursor || page.cursor === cursor) break;
    cursor = page.cursor;
  }


  commitments.sort((a,b)=>a.index-b.index);

  return commitments;
}
