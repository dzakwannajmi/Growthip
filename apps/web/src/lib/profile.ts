/**
 * profile.ts
 *
 * Lightweight, local-only creator profile data: a display name/bio/avatar
 * variant the creator can set for themselves. Stored in localStorage,
 * namespaced per wallet address (same pattern as note.ts) -- this is
 * purely cosmetic local UI state, not published anywhere on-chain, and
 * not visible to anyone else.
 *
 * KNOWN LIMITATION: because this is localStorage-only, a creator's
 * displayName/avatar only render on /tip/[id] if the supporter happens
 * to be browsing from the same browser/device the creator used to set
 * up their profile. In the general case (supporter on a different
 * device), the tip page falls back to a generic dashed-avatar +
 * truncated address -- this is expected behavior, not a bug. Making
 * profile data visible cross-device would require moving it on-chain
 * (e.g. into the Creator Registry contract alongside is_premium), which
 * is tracked as a roadmap item, not implemented yet.
 *
 * Avatars are rendered LOCALLY via @dicebear/core + @dicebear/collection
 * (identicon style), producing a data: URI -- no network round-trip to
 * api.dicebear.com. This deliberately avoids @dicebear/styles, whose
 * current API requires `with { type: "json" }` import-attribute syntax
 * (untested under this project's Turbopack setup); @dicebear/collection
 * exposes the same styles, including identicon, via a plain named
 * import (`import { identicon } from "@dicebear/collection"`), so the
 * same visual result is reached without that risk.
 *
 * Style is fixed to "identicon" -- not a multi-style picker. Variety
 * comes from a curated list of seed strings (below); note that this
 * list was originally curated and eyeballed for "bottts-neutral" (robot
 * avatars) -- since the switch to identicon (grid-pattern avatars), the
 * seeds still produce visually distinct results from each other, but
 * the "verified good-looking" claim was specific to the old style and
 * hasn't been re-verified against identicon's output.
 */

import { createAvatar } from "@dicebear/core";
import { identicon } from "@dicebear/collection";

export interface CreatorProfile {
  displayName: string;
  bio: string;
  /** Which seed variant (a name from AVATAR_VARIANTS) the creator picked.
   * Empty string = use the address itself as the seed (the original,
   * un-varied default). */
  avatarVariant: string;
  updatedAt: number;
}

function storageKeyFor(address: string): string {
  return `growthip:profile:${address}`;
}

const DEFAULT_PROFILE: CreatorProfile = {
  displayName: "",
  bio: "",
  avatarVariant: "",
  updatedAt: 0,
};

/** Curated seed names, each verified to produce a visually distinct,
 * good-looking bottts-neutral robot. These are used as DiceBear seeds
 * directly (not combined with the address) -- picking one means "use
 * this specific robot," not "a variant derived from my address." */
export const AVATAR_VARIANTS = [
  "AlexRivera",
  "LunaStarlight",
  "KaitoZero",
  "NovaPixel",
  "ZaraKnight",
  "MiloByte",
  "SofiaMech",
  "RianCircuit",
  "AikoSpark",
  "JaxNeon",
  "ElenaDroid",
  "TheoBolt",
  "NadiaGear",
  "KaiRobotix",
  "FreyaUnit",
  "DamienCore",
  "LioraByte",
  "RafaelWire",
  "SeleneNode",
  "MarcusFlux",
] as const;

export function getProfile(address: string): CreatorProfile {
  try {
    const raw = localStorage.getItem(storageKeyFor(address));
    if (!raw) return DEFAULT_PROFILE;
    return { ...DEFAULT_PROFILE, ...JSON.parse(raw) } as CreatorProfile;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(
  address: string,
  profile: Omit<CreatorProfile, "updatedAt">,
): void {
  const full: CreatorProfile = { ...profile, updatedAt: Date.now() };
  localStorage.setItem(storageKeyFor(address), JSON.stringify(full));
}

/**
 * Locally-rendered identicon avatar as a data: URI (SVG). `variant`
 * (defaults to whatever the creator has saved, or "" if never set)
 * picks which curated seed name to use; "" falls back to the wallet
 * address itself as the seed. No network request -- generated
 * synchronously in-browser via @dicebear/core + @dicebear/collection.
 */
export function avatarUrlFor(address: string, variant?: string): string {
  const resolvedVariant = variant !== undefined ? variant : getProfile(address).avatarVariant;
  const seed = resolvedVariant || address;
  return createAvatar(identicon, { seed }).toDataUri();
}