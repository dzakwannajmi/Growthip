import { encodeTipId, decodeTipId } from "./addressId";
import type { Client as PoolClient } from "./growthipPoolClient";

const CAMPAIGN_MESSAGE_PREFIX = "growthip:campaign:";
const CAMPAIGN_ID_LENGTH = 8;
const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export interface CampaignMetadata {
  recipientAddress: string;
  campaignId: string;
  title: string;
  /** Goal amount in the token's base units (stroops). */
  goalAmount: number;
  /** Unix timestamp in seconds, or null for no deadline. */
  deadline: number | null;
  tokenSymbol: string;
}

export interface CampaignProgress {
  /** Total raised, in the token's base units (stroops). */
  totalRaised: bigint;
  depositCount: number;
  /** totalRaised / goalAmount, clamped to [0, 1]. 0 if goal is 0. */
  progressRatio: number;
}

export function generateCampaignId(): string {
  const bytes = new Uint8Array(CAMPAIGN_ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) {
    out += BASE62_ALPHABET[b % BASE62_ALPHABET.length];
  }
  return out;
}

export function encodeCampaignMessage(campaignId: string): string {
  return `${CAMPAIGN_MESSAGE_PREFIX}${campaignId}`;
}

export function decodeCampaignMessage(
  message: string | null | undefined
): string | null {
  if (!message || !message.startsWith(CAMPAIGN_MESSAGE_PREFIX)) return null;
  return message.slice(CAMPAIGN_MESSAGE_PREFIX.length);
}

export function buildCampaignPath(meta: CampaignMetadata): string {
  const tipId = encodeTipId(meta.recipientAddress);
  const params = new URLSearchParams({
    title: meta.title,
    goal: String(meta.goalAmount),
    token: meta.tokenSymbol,
  });
  if (meta.deadline !== null) {
    params.set("deadline", String(meta.deadline));
  }
  return `/campaign/${tipId}/${meta.campaignId}?${params.toString()}`;
}

export function parseCampaignRoute(
  tipId: string,
  campaignId: string,
  searchParams: URLSearchParams
): CampaignMetadata {
  const recipientAddress = decodeTipId(tipId);
  const title = searchParams.get("title") ?? "Untitled Campaign";
  const goalAmount = Number(searchParams.get("goal") ?? "0");
  const tokenSymbol = searchParams.get("token") ?? "XLM";
  const deadlineRaw = searchParams.get("deadline");
  const deadline = deadlineRaw ? Number(deadlineRaw) : null;

  return { recipientAddress, campaignId, title, goalAmount, deadline, tokenSymbol };
}

/**
 * Scans the pool's deposits and sums the ones tagged for this campaign.
 *
 * KNOWN LIMITATION: O(n) in the pool's TOTAL deposit count, not just
 * this campaign's -- it calls get_message()/get_commitment_amount() once
 * per deposit index. This is correct and cheap at the pool sizes
 * Growthip sees today (tens of deposits on testnet). It is NOT how this
 * should work once a pool holds thousands of real deposits -- that
 * needs an indexer or on-chain event log query instead of a full scan.
 * Tracked as a post-hackathon scalability item, not solved here.
 */
export async function getCampaignProgress(
  poolClient: PoolClient,
  campaignId: string,
  goalAmount: number
): Promise<CampaignProgress> {
  const targetMessage = encodeCampaignMessage(campaignId);
  const { result: total } = await poolClient.total_deposits();

  let totalRaised = 0n;
  let depositCount = 0;

  for (let i = 0; i < total; i++) {
    const { result: message } = await poolClient.get_message({ index: i });
    const { campaignId: taggedId } = message ? unwrapCampaignMessage(message) : { campaignId: null };
    if (taggedId === campaignId) {
      const { result: amount } = await poolClient.get_commitment_amount({ index: i });
      totalRaised += BigInt(amount);
      depositCount++;
    }
  }

  const progressRatio =
    goalAmount > 0 ? Math.min(1, Number(totalRaised) / goalAmount) : 0;

  return { totalRaised, depositCount, progressRatio };
}

// ─────────────────────────────────────────────────────────────────────
// Local persistence of a creator's created campaigns.
//
// Campaign metadata (title, goal, deadline) lives in the shareable
// URL's query string, not on-chain -- so the creator needs somewhere to
// remember which campaigns they've created, to relist and reshare them
// from the dashboard. Same localStorage-per-wallet pattern as note.ts
// and profile.ts. This is cosmetic/convenience state only: losing it
// does not affect any on-chain funds or a campaign's ability to still
// receive deposits via its URL -- it only affects whether the creator
// sees it listed in their own dashboard.
// ─────────────────────────────────────────────────────────────────────

function campaignStorageKey(address: string): string {
  return `growthip:campaigns:${address}`;
}

/** Loads all campaigns a creator has created, newest first. */
export function loadCampaigns(recipientAddress: string): CampaignMetadata[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(campaignStorageKey(recipientAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CampaignMetadata[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persists a newly created campaign, most-recent-first. */
export function saveCampaign(meta: CampaignMetadata): void {
  if (typeof window === "undefined") return;
  const existing = loadCampaigns(meta.recipientAddress);
  const updated = [meta, ...existing.filter((c) => c.campaignId !== meta.campaignId)];
  localStorage.setItem(
    campaignStorageKey(meta.recipientAddress),
    JSON.stringify(updated)
  );
}

/** Removes a campaign from the creator's local list (does not affect
 *  on-chain funds already raised -- the URL still works for anyone who
 *  has it, this only stops it showing in the dashboard). */
export function deleteCampaign(recipientAddress: string, campaignId: string): void {
  if (typeof window === "undefined") return;
  const existing = loadCampaigns(recipientAddress);
  const updated = existing.filter((c) => c.campaignId !== campaignId);
  localStorage.setItem(
    campaignStorageKey(recipientAddress),
    JSON.stringify(updated)
  );
}

// ─────────────────────────────────────────────────────────────────────
// Campaign-tagged deposit messages.
//
// deposit_paid()'s `message` field is also where the encrypted private
// note bundle is stored (see /tip/[id]/page.tsx and dashboard/activity/
// page.tsx's fetchOnChainNotes()) -- private notes are mandatory, so a
// real deposit's message is always an encrypted bundle, never plain
// text. A campaign deposit therefore can't just overwrite message with
// a campaign tag; it must carry BOTH the tag (for progress tracking)
// and the encrypted bundle (for the creator's auto-fetch/claim flow),
// in one string.
// ─────────────────────────────────────────────────────────────────────

const CAMPAIGN_TAGGED_SEPARATOR = "|";

/** Wraps an encrypted note bundle with a campaign tag for on-chain
 *  storage in deposit_paid()'s message field. */
export function wrapCampaignMessage(
  campaignId: string,
  encryptedBundle: string
): string {
  return `${encodeCampaignMessage(campaignId)}${CAMPAIGN_TAGGED_SEPARATOR}${encryptedBundle}`;
}

/**
 * Splits a raw on-chain message into its campaign ID (if any) and the
 * underlying encrypted bundle. Returns campaignId: null for a message
 * that isn't campaign-tagged -- callers should treat the returned
 * `bundle` as the value to pass to decryptIncomingNote() either way.
 */
export function unwrapCampaignMessage(
  rawMessage: string
): { campaignId: string | null; bundle: string } {
  if (!rawMessage.startsWith(CAMPAIGN_MESSAGE_PREFIX)) {
    return { campaignId: null, bundle: rawMessage };
  }
  const sepIdx = rawMessage.indexOf(CAMPAIGN_TAGGED_SEPARATOR);
  if (sepIdx === -1) {
    // Tagged but no separator found -- malformed, treat whole thing as
    // opaque (decryption will fail downstream, which is the correct
    // fail-closed behavior rather than silently guessing).
    return { campaignId: null, bundle: rawMessage };
  }
  const campaignId = rawMessage.slice(CAMPAIGN_MESSAGE_PREFIX.length, sepIdx);
  const bundle = rawMessage.slice(sepIdx + 1);
  return { campaignId, bundle };
}
