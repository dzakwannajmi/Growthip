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
