// Client-side mirror of pool-v5's hash_ext_data / calc_public_amount, so a
// proof binds to exactly the ext data the contract will recompute on-chain.
//
// Adapted from fxjrin/cyphras extension/src/shielded/extdata.ts (Apache-2.0).
// zk-types::ExtData in pool-v5 is field-identical to the Cyphras vault's, so
// this canonical encoding carries over exactly.
//
// HOW IT MATCHES THE CONTRACT: soroban #[contracttype] structs serialize as an
// ScMap with entries sorted lexicographically by field-name symbol —
//   encrypted_output0 < encrypted_output1 < ext_amount < fee < recipient < relayer
// — then `ext.to_xdr(env)` is that ScVal's XDR bytes. The contract keccak256s
// those bytes and reduces mod the BN254 field. Reordering entries, changing a
// field name, or changing a type breaks the hash SILENTLY (you get
// WrongExtHash at transact) — never edit this without re-running the parity
// check against the Rust emitter (see extDataHash parity note below).
//
// Buffer note: @stellar/stellar-sdk itself requires Buffer, and Growthip V4
// already runs the SDK client-side, so Buffer availability is already solved
// in this app; this module doesn't add a new polyfill requirement.

import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "./hex";

/** BN254 scalar field modulus (same constant the circuit and contract use). */
export const FIELD =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export interface ExtDataInput {
  extAmount: bigint; // signed: + deposit, - withdraw, 0 transfer
  fee: bigint; // >= 0, paid to relayer
  recipient: string; // G... or C... Stellar address
  relayer: string;
  encryptedOutput0: Uint8Array; // note ciphertexts (noteEncryption.ts, 147 bytes)
  encryptedOutput1: Uint8Array;
}

function entry(name: string, val: xdr.ScVal): xdr.ScMapEntry {
  return new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(name), val });
}

/** Build the ExtData ScVal exactly as the soroban contracttype serializes it. */
export function extDataScVal(e: ExtDataInput): xdr.ScVal {
  // Keys sorted by symbol for canonical XDR — DO NOT reorder.
  return xdr.ScVal.scvMap([
    entry("encrypted_output0", xdr.ScVal.scvBytes(Buffer.from(e.encryptedOutput0))),
    entry("encrypted_output1", xdr.ScVal.scvBytes(Buffer.from(e.encryptedOutput1))),
    entry("ext_amount", nativeToScVal(e.extAmount, { type: "i128" })),
    entry("fee", nativeToScVal(e.fee, { type: "i128" })),
    entry("recipient", new Address(e.recipient).toScVal()),
    entry("relayer", new Address(e.relayer).toScVal()),
  ]);
}

/** ext_data_hash = keccak256(XDR(ExtData)) mod FIELD, matching hash_ext_data. */
export function computeExtDataHash(e: ExtDataInput): bigint {
  const bytes = extDataScVal(e).toXDR();
  const digest = keccak_256(bytes);
  return BigInt("0x" + bytesToHex(digest)) % FIELD;
}

/** publicAmount = (extAmount - fee) as a field element; negatives wrap p+x. */
export function calcPublicAmount(e: ExtDataInput): bigint {
  const signed = e.extAmount - e.fee;
  return signed >= 0n ? signed : FIELD + signed;
}
