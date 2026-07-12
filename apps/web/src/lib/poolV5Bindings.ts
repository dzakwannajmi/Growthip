import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDPC5X2QR7OTZEVMKF6HRXL5N2CN6BSMJ2RXEPEQUJ42JMO7JEB375DU",
  }
} as const

export const Errors = {
  1: {message:"AlreadyInitialized"},
  2: {message:"NotInitialized"},
  4: {message:"UnknownRoot"},
  5: {message:"SpentNullifier"},
  6: {message:"WrongExtHash"},
  7: {message:"WrongPublicAmount"},
  8: {message:"InvalidProof"},
  9: {message:"DepositTooLarge"},
  10: {message:"BadExtData"},
  11: {message:"Reentrancy"},
  12: {message:"TreeFull"},
  13: {message:"NonCanonicalInput"},
  14: {message:"BadDomain"},
  15: {message:"Paused"},
  16: {message:"BadConfig"},
  17: {message:"NotAdmin"},
  18: {message:"MalformedProof"}
}

export type DataKey = {tag: "Admin", values: void} | {tag: "Token", values: void} | {tag: "Domain", values: void} | {tag: "MaxDeposit", values: void} | {tag: "TvlCap", values: void} | {tag: "Tvl", values: void} | {tag: "Paused", values: void} | {tag: "Lock", values: void} | {tag: "CurrentRoot", values: void} | {tag: "RootHistory", values: void} | {tag: "Frontier", values: void} | {tag: "NextLeafIndex", values: void} | {tag: "TotalNullifiers", values: void} | {tag: "NullifierUsed", values: readonly [u256]} | {tag: "EncKey", values: readonly [string]};




export interface RegisteredEncKey {
  value: Buffer;
  version: u32;
}


/**
 * External (public) transaction data, bound into the proof via ext_data_hash.
 * ext_amount sign: positive deposit, negative withdrawal, zero transfer.
 */
export interface ExtData {
  encrypted_output0: Buffer;
  encrypted_output1: Buffer;
  ext_amount: i128;
  fee: i128;
  recipient: string;
  relayer: string;
}


/**
 * Proof plus the public signals the pool binds. `domain` is intentionally NOT
 * here — the pool injects it from storage so proofs cannot cross pools.
 * Public-input order the circuit declares:
 * root, publicAmount, extDataHash, domain, inputNullifier[2], outputCommitment[2]
 */
export interface TxProof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
  ext_data_hash: u256;
  input_nullifiers: Array<u256>;
  output_commitments: Array<u256>;
  public_amount: u256;
  root: u256;
}

export const Groth16Error = {
  0: {message:"InvalidProof"},
  1: {message:"MalformedPublicInputs"}
}


/**
 * Uncompressed affine, big-endian, matching the host's BN254 encoding.
 */
export interface Groth16Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  upgrade: ({new_wasm_hash}: {new_wasm_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a transact transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The shielded JoinSplit entry point. Deposit (ext_amount > 0), withdraw
   * (< 0), or internal transfer (== 0). Spends two input notes, inserts two
   * output notes.
   */
  transact: ({proof, ext, sender}: {proof: TxProof, ext: ExtData, sender: string}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Initialize the pool. `domain` MUST be unique per pool (XLM V5 != USDC V5)
   * and non-zero/canonical — this is the cross-pool replay guard.
   */
  initialize: ({admin, token, domain, max_deposit, tvl_cap}: {admin: string, token: string, domain: u256, max_deposit: i128, tvl_cap: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a set_paused transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_paused: ({paused}: {paused: boolean}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a get_enc_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_enc_key: ({owner}: {owner: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<RegisteredEncKey>>>

  /**
   * Construct and simulate a current_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  current_root: (options?: MethodOptions) => Promise<AssembledTransaction<u256>>

  /**
   * Construct and simulate a is_known_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_known_root: ({root}: {root: u256}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a register_enc_key transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Register or rotate the caller's note-viewing pubkey (for `gr` stealth
   * discovery). Versioned + owner-authorized: cannot be front-run, and a
   * newer version always supersedes.
   */
  register_enc_key: ({owner, version, pubkey}: {owner: string, version: u32, pubkey: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a is_nullifier_spent transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_spent: ({nullifier}: {nullifier: u256}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAAEQAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA5Ob3RJbml0aWFsaXplZAAAAAAAAgAAAAAAAAALVW5rbm93blJvb3QAAAAABAAAAAAAAAAOU3BlbnROdWxsaWZpZXIAAAAAAAUAAAAAAAAADFdyb25nRXh0SGFzaAAAAAYAAAAAAAAAEVdyb25nUHVibGljQW1vdW50AAAAAAAABwAAAAAAAAAMSW52YWxpZFByb29mAAAACAAAAAAAAAAPRGVwb3NpdFRvb0xhcmdlAAAAAAkAAAAAAAAACkJhZEV4dERhdGEAAAAAAAoAAAAAAAAAClJlZW50cmFuY3kAAAAAAAsAAAAAAAAACFRyZWVGdWxsAAAADAAAAAAAAAARTm9uQ2Fub25pY2FsSW5wdXQAAAAAAAANAAAAAAAAAAlCYWREb21haW4AAAAAAAAOAAAAAAAAAAZQYXVzZWQAAAAAAA8AAAAAAAAACUJhZENvbmZpZwAAAAAAABAAAAAAAAAACE5vdEFkbWluAAAAEQAAAAAAAAAOTWFsZm9ybWVkUHJvb2YAAAAAABI=",
        "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAAAAAAAZEb21haW4AAAAAAAAAAAAAAAAACk1heERlcG9zaXQAAAAAAAAAAAAAAAAABlR2bENhcAAAAAAAAAAAAAAAAAADVHZsAAAAAAAAAAAAAAAABlBhdXNlZAAAAAAAAAAAAAAAAAAETG9jawAAAAAAAAAAAAAAC0N1cnJlbnRSb290AAAAAAAAAAAAAAAAC1Jvb3RIaXN0b3J5AAAAAAAAAAAAAAAACEZyb250aWVyAAAAAAAAAAAAAAANTmV4dExlYWZJbmRleAAAAAAAAAAAAAAAAAAAD1RvdGFsTnVsbGlmaWVycwAAAAABAAAAAAAAAA1OdWxsaWZpZXJVc2VkAAAAAAAAAQAAAAwAAAABAAAAAAAAAAZFbmNLZXkAAAAAAAEAAAAT",
        "AAAABQAAAERQcml2YWN5LXNhZmUgc3BlbmQgZXZlbnQ6IG51bGxpZmllciBvbmx5LCBuZXZlciB0aGUgc3BlbmRlciBhZGRyZXNzLgAAAAAAAAAMTmV3TnVsbGlmaWVyAAAAAQAAAAludWxsaWZpZXIAAAAAAAABAAAAAAAAAAludWxsaWZpZXIAAAAAAAAMAAAAAAAAAAA=",
        "AAAABQAAAJNQcml2YWN5LXNhZmUgZGVwb3NpdC9jb21taXRtZW50IGV2ZW50OiBpbmRleCArIGNvbW1pdG1lbnQgKyBjaXBoZXJ0ZXh0IGZvcgpjbGllbnQtc2lkZSBub3RlIGRpc2NvdmVyeSAodHJpYWwtZGVjcnlwdCksIG5ldmVyIHRoZSBkZXBvc2l0b3IgYWRkcmVzcy4AAAAAAAAAAA1OZXdDb21taXRtZW50AAAAAAAAAQAAAApjb21taXRtZW50AAAAAAADAAAAAAAAAAVpbmRleAAAAAAAAAQAAAAAAAAAAAAAAApjb21taXRtZW50AAAAAAAMAAAAAAAAAAAAAAAQZW5jcnlwdGVkX291dHB1dAAAAA4AAAAAAAAAAg==",
        "AAAAAQAAAAAAAAAAAAAAEFJlZ2lzdGVyZWRFbmNLZXkAAAACAAAAAAAAAAV2YWx1ZQAAAAAAA+4AAAAgAAAAAAAAAAd2ZXJzaW9uAAAAAAQ=",
        "AAAAAAAAAAAAAAAHdXBncmFkZQAAAAABAAAAAAAAAA1uZXdfd2FzbV9oYXNoAAAAAAAD7gAAACAAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAJxUaGUgc2hpZWxkZWQgSm9pblNwbGl0IGVudHJ5IHBvaW50LiBEZXBvc2l0IChleHRfYW1vdW50ID4gMCksIHdpdGhkcmF3Cig8IDApLCBvciBpbnRlcm5hbCB0cmFuc2ZlciAoPT0gMCkuIFNwZW5kcyB0d28gaW5wdXQgbm90ZXMsIGluc2VydHMgdHdvCm91dHB1dCBub3Rlcy4AAAAIdHJhbnNhY3QAAAADAAAAAAAAAAVwcm9vZgAAAAAAB9AAAAAHVHhQcm9vZgAAAAAAAAAAA2V4dAAAAAfQAAAAB0V4dERhdGEAAAAAAAAAAAZzZW5kZXIAAAAAABMAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAIlJbml0aWFsaXplIHRoZSBwb29sLiBgZG9tYWluYCBNVVNUIGJlIHVuaXF1ZSBwZXIgcG9vbCAoWExNIFY1ICE9IFVTREMgVjUpCmFuZCBub24temVyby9jYW5vbmljYWwg4oCUIHRoaXMgaXMgdGhlIGNyb3NzLXBvb2wgcmVwbGF5IGd1YXJkLgAAAAAAAAppbml0aWFsaXplAAAAAAAFAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAABXRva2VuAAAAAAAAEwAAAAAAAAAGZG9tYWluAAAAAAAMAAAAAAAAAAttYXhfZGVwb3NpdAAAAAALAAAAAAAAAAd0dmxfY2FwAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAAAAAAAKc2V0X3BhdXNlZAAAAAAAAQAAAAAAAAAGcGF1c2VkAAAAAAABAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAAAAAAALZ2V0X2VuY19rZXkAAAAAAQAAAAAAAAAFb3duZXIAAAAAAAATAAAAAQAAA+gAAAfQAAAAEFJlZ2lzdGVyZWRFbmNLZXk=",
        "AAAAAAAAAAAAAAAMY3VycmVudF9yb290AAAAAAAAAAEAAAAM",
        "AAAAAAAAAAAAAAANaXNfa25vd25fcm9vdAAAAAAAAAEAAAAAAAAABHJvb3QAAAAMAAAAAQAAAAE=",
        "AAAAAAAAAKtSZWdpc3RlciBvciByb3RhdGUgdGhlIGNhbGxlcidzIG5vdGUtdmlld2luZyBwdWJrZXkgKGZvciBgZ3JgIHN0ZWFsdGgKZGlzY292ZXJ5KS4gVmVyc2lvbmVkICsgb3duZXItYXV0aG9yaXplZDogY2Fubm90IGJlIGZyb250LXJ1biwgYW5kIGEKbmV3ZXIgdmVyc2lvbiBhbHdheXMgc3VwZXJzZWRlcy4AAAAAEHJlZ2lzdGVyX2VuY19rZXkAAAADAAAAAAAAAAVvd25lcgAAAAAAABMAAAAAAAAAB3ZlcnNpb24AAAAABAAAAAAAAAAGcHVia2V5AAAAAAPuAAAAIAAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAAAAAAASaXNfbnVsbGlmaWVyX3NwZW50AAAAAAABAAAAAAAAAAludWxsaWZpZXIAAAAAAAAMAAAAAQAAAAE=",
        "AAAAAQAAAJJFeHRlcm5hbCAocHVibGljKSB0cmFuc2FjdGlvbiBkYXRhLCBib3VuZCBpbnRvIHRoZSBwcm9vZiB2aWEgZXh0X2RhdGFfaGFzaC4KZXh0X2Ftb3VudCBzaWduOiBwb3NpdGl2ZSBkZXBvc2l0LCBuZWdhdGl2ZSB3aXRoZHJhd2FsLCB6ZXJvIHRyYW5zZmVyLgAAAAAAAAAAAAdFeHREYXRhAAAAAAYAAAAAAAAAEWVuY3J5cHRlZF9vdXRwdXQwAAAAAAAADgAAAAAAAAARZW5jcnlwdGVkX291dHB1dDEAAAAAAAAOAAAAAAAAAApleHRfYW1vdW50AAAAAAALAAAAAAAAAANmZWUAAAAACwAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAHcmVsYXllcgAAAAAT",
        "AAAAAQAAAQxQcm9vZiBwbHVzIHRoZSBwdWJsaWMgc2lnbmFscyB0aGUgcG9vbCBiaW5kcy4gYGRvbWFpbmAgaXMgaW50ZW50aW9uYWxseSBOT1QKaGVyZSDigJQgdGhlIHBvb2wgaW5qZWN0cyBpdCBmcm9tIHN0b3JhZ2Ugc28gcHJvb2ZzIGNhbm5vdCBjcm9zcyBwb29scy4KUHVibGljLWlucHV0IG9yZGVyIHRoZSBjaXJjdWl0IGRlY2xhcmVzOgpyb290LCBwdWJsaWNBbW91bnQsIGV4dERhdGFIYXNoLCBkb21haW4sIGlucHV0TnVsbGlmaWVyWzJdLCBvdXRwdXRDb21taXRtZW50WzJdAAAAAAAAAAdUeFByb29mAAAAAAgAAAAAAAAAAWEAAAAAAAPuAAAAQAAAAAAAAAABYgAAAAAAA+4AAACAAAAAAAAAAAFjAAAAAAAD7gAAAEAAAAAAAAAADWV4dF9kYXRhX2hhc2gAAAAAAAAMAAAAAAAAABBpbnB1dF9udWxsaWZpZXJzAAAD6gAAAAwAAAAAAAAAEm91dHB1dF9jb21taXRtZW50cwAAAAAD6gAAAAwAAAAAAAAADXB1YmxpY19hbW91bnQAAAAAAAAMAAAAAAAAAARyb290AAAADA==",
        "AAAABAAAAAAAAAAAAAAADEdyb3RoMTZFcnJvcgAAAAIAAAAAAAAADEludmFsaWRQcm9vZgAAAAAAAAAAAAAAFU1hbGZvcm1lZFB1YmxpY0lucHV0cwAAAAAAAAE=",
        "AAAAAQAAAERVbmNvbXByZXNzZWQgYWZmaW5lLCBiaWctZW5kaWFuLCBtYXRjaGluZyB0aGUgaG9zdCdzIEJOMjU0IGVuY29kaW5nLgAAAAAAAAAMR3JvdGgxNlByb29mAAAAAwAAAAAAAAABYQAAAAAAA+4AAABAAAAAAAAAAAFiAAAAAAAD7gAAAIAAAAAAAAAAAWMAAAAAAAPuAAAAQA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    upgrade: this.txFromJSON<Result<void>>,
        transact: this.txFromJSON<Result<void>>,
        initialize: this.txFromJSON<Result<void>>,
        set_paused: this.txFromJSON<Result<void>>,
        get_enc_key: this.txFromJSON<Option<RegisteredEncKey>>,
        current_root: this.txFromJSON<u256>,
        is_known_root: this.txFromJSON<boolean>,
        register_enc_key: this.txFromJSON<Result<void>>,
        is_nullifier_spent: this.txFromJSON<boolean>
  }
}