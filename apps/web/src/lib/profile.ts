/**
 * profile.ts
 *
 * Lightweight, local-only creator profile data: a display name/bio/avatar
 * variant the creator can set for themselves. Stored in localStorage,
 * namespaced per wallet address (same pattern as note.ts) -- this is
 * purely cosmetic local UI state, not published anywhere on-chain, and
 * not visible to anyone else.
 *
 * Avatars are rendered via DiceBear's public HTTP API (api.dicebear.com),
 * not a bundled library -- deliberate choice over @dicebear/core +
 * @dicebear/styles after finding the bundled approach would add real
 * risk (untested `with { type: "json" }` import-attribute syntax under
 * Turbopack, extra bundle weight) for an identical visual result the
 * public API already provides for free, with zero new dependencies.
 *
 * Style is fixed to "bottts-neutral" (robot avatars) -- not a multi-style
 * picker. Variety comes from a curated list of seed strings (below) that
 * each produce a visually distinct robot within that one style.
 */

const AVATAR_DICEBEAR_STYLE = "bottts-neutral";

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
 * DiceBear public HTTP API avatar URL. Always bottts-neutral style.
 * `variant` (defaults to whatever the creator has saved, or "" if never
 * set) picks which curated seed name to use; "" falls back to the
 * wallet address itself as the seed.
 */
export function avatarUrlFor(address: string, variant?: string): string {
  const resolvedVariant = variant !== undefined ? variant : getProfile(address).avatarVariant;
  const seed = resolvedVariant || address;
  return `https://api.dicebear.com/7.x/${AVATAR_DICEBEAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}