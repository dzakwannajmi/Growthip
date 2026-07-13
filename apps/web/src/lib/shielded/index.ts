// Growthip V5 shielded key + address module (client-side).
// Seed-agnostic: the caller supplies the seed (see keys.ts note on seed sourcing).

export {
  SUBGROUP_ORDER,
  mulBase,
  mulPoint,
  packPoint,
  unpackPoint,
  onCurve,
  inSubgroup,
  randScalar,
  type Point,
} from "./babyjub";
export { poseidon2, setCircuitBase, circuitBase } from "./poseidon2";
export {
  DOM,
  DEFAULT_DIVERSIFIER,
  deriveShieldedKeys,
  diversifiedKey,
  wideToScalar,
  deriveBytes,
  dField,
  type ShieldedKeys,
} from "./keys";
export { HRP, encodeAddress, parseAddress } from "./address";
export { bytesToHex, bytesToBigInt, concatBytes } from "./hex";
export { encryptNoteForRecipient, tryDecryptNote, CIPHERTEXT_LEN } from "./noteEncryption";
export { scanForGrNotes, type DiscoveredGrNote } from "./grNoteScan";
export { computeExtDataHash, calcPublicAmount, extDataScVal, FIELD, type ExtDataInput } from "./extDataHash";
export {
  buildDepositInput,
  generateTipProof,
  noteCommitment,
  randomBlinding,
  type CircuitInput,
  type ProveFn,
  type TxProofHex,
  type BuildDepositArgs,
} from "./tipFlow";
export { newGrMnemonic, isValidGrMnemonic, grSeedFromMnemonic, GR_MNEMONIC_STRENGTH_BITS } from "./seed";
export {
  createGrIdentity,
  restoreGrIdentity,
  unlockGrIdentity,
  isGrUnlocked,
  lockGrSession,
  getGrSeed,
  getStoredGrAddress,
  hasStoredGrIdentity,
  deleteGrIdentityCompletely,
  type CreateGrIdentityResult,
} from "./grIdentity";

export { proveV5 } from "./zkpV5";
