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
    contractId: process.env.NEXT_PUBLIC_POOL_ID ?? "CAX3PNHYOZPXF2X2VKTYV3PGXJWOJ6PPYHOWBGVC563K6SLJTE6XDAQG",
  }
} as const

export type DataKey = { tag: "Admin", values: void } | { tag: "Verifier", values: void } | { tag: "Token", values: void } | { tag: "CurrentRoot", values: void } | { tag: "RootHistory", values: void } | { tag: "RecipientHash", values: readonly [string] } | { tag: "NullifierUsed", values: readonly [Buffer] } | { tag: "Commitment", values: readonly [u32] } | { tag: "CommitmentAmount", values: readonly [u32] } | { tag: "Message", values: readonly [u32] } | { tag: "TotalDeposits", values: void } | { tag: "TotalClaims", values: void } | { tag: "TipAmount", values: void } | { tag: "Treasury", values: void } | { tag: "AccumulatedFee", values: void };



export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({ proof_bytes, public_inputs }: { proof_bytes: Buffer, public_inputs: Array<Buffer> }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a upgrade transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Upgrade the pool contract WASM (admin only).
   * Allows fixing bugs without redeploying and losing state (audit finding H3).
   */
  upgrade: ({ admin, new_wasm_hash }: { admin: string, new_wasm_hash: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a claim_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim_to: ({ recipient, proof_bytes, public_inputs }: { recipient: string, proof_bytes: Buffer, public_inputs: Array<Buffer> }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_token: ({ admin, token_addr }: { admin: string, token_addr: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({ admin, verifier, root, tip_amount, treasury }: { admin: string, verifier: string, root: Buffer, tip_amount: i128, treasury: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a tip_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  tip_amount: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_message transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of an optional donor message attached to a deposit.
   * Returns None if no message was provided at deposit time.
   */
  get_message: ({ index }: { index: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<Option<string>>>

  /**
   * Construct and simulate a update_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_root: ({ admin, new_root }: { admin: string, new_root: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a current_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  current_root: (options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a deposit_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit_paid: ({ depositor, commitment, amount, message }: { depositor: string, commitment: Buffer, amount: i128, message: Option<string> }, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a total_claims transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_claims: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a withdraw_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-gated batch withdrawal of accumulated platform fees to the
   * treasury address. Deliberately separate from claim_to() and
   * callable at any time, independent of any specific claim -- this
   * breaks the on-chain link between "who just claimed" and "when did
   * the treasury receive money", preserving claim-level privacy.
   */
  withdraw_fees: ({ admin }: { admin: string }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a get_commitment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_commitment: ({ index }: { index: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a total_deposits transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_deposits: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a update_verifier transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_verifier: ({ admin, new_verifier }: { admin: string, new_verifier: string }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a accumulated_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of the current accumulated (not-yet-withdrawn) fee
   * balance, for dashboards/transparency.
   */
  accumulated_fees: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_used: ({ nullifier_hash }: { nullifier_hash: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_recipient_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Returns the registered recipient hash, or None if not registered.
   * Returns Option to avoid panicking on read-only simulation (audit finding L1).
   */
  get_recipient_hash: ({ recipient }: { recipient: string }, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>

  /**
   * Construct and simulate a register_recipient transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_recipient: ({ recipient, recipient_hash }: { recipient: string, recipient_hash: Buffer }, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_commitment_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_commitment_amount: ({ index }: { index: u32 }, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

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
      new ContractSpec(["AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAADwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIVmVyaWZpZXIAAAAAAAAAAAAAAAVUb2tlbgAAAAAAAAAAAAAAAAAAC0N1cnJlbnRSb290AAAAAAAAAAAAAAAAC1Jvb3RIaXN0b3J5AAAAAAEAAAAAAAAADVJlY2lwaWVudEhhc2gAAAAAAAABAAAAEwAAAAEAAAAAAAAADU51bGxpZmllclVzZWQAAAAAAAABAAAD7gAAACAAAAABAAAAAAAAAApDb21taXRtZW50AAAAAAABAAAABAAAAAEAAAAAAAAAEENvbW1pdG1lbnRBbW91bnQAAAABAAAABAAAAAEAAAAAAAAAB01lc3NhZ2UAAAAAAQAAAAQAAAAAAAAAAAAAAA1Ub3RhbERlcG9zaXRzAAAAAAAAAAAAAAAAAAALVG90YWxDbGFpbXMAAAAAAAAAAAAAAAAJVGlwQW1vdW50AAAAAAAAAAAAAAAAAAAIVHJlYXN1cnkAAAAAAAAAAAAAAA5BY2N1bXVsYXRlZEZlZQAA",
        "AAAABQAAAFxQcml2YWN5LXNhZmUgY2xhaW0gZXZlbnQ6IG9ubHkgdGhlIG51bGxpZmllciBoYXNoIGlzIHB1Ymxpc2hlZCwgbmV2ZXIKdGhlIHJlY2lwaWVudCBhZGRyZXNzLgAAAAAAAAAKQ2xhaW1FdmVudAAAAAAAAQAAAAVjbGFpbQAAAAAAAAEAAAAAAAAADm51bGxpZmllcl9oYXNoAAAAAAPuAAAAIAAAAAAAAAAA",
        "AAAABQAAAG5Qcml2YWN5LXNhZmUgZGVwb3NpdCBldmVudDogb25seSB0aGUgbGVhZiBpbmRleCBpcyBwdWJsaXNoZWQsIG5ldmVyCnRoZSBkZXBvc2l0b3IgYWRkcmVzcyBvciBjb21taXRtZW50IHZhbHVlLgAAAAAAAAAAAAxEZXBvc2l0RXZlbnQAAAABAAAAB2RlcG9zaXQAAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAAAAAAA=",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAACAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAD6gAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAHhVcGdyYWRlIHRoZSBwb29sIGNvbnRyYWN0IFdBU00gKGFkbWluIG9ubHkpLgpBbGxvd3MgZml4aW5nIGJ1Z3Mgd2l0aG91dCByZWRlcGxveWluZyBhbmQgbG9zaW5nIHN0YXRlIChhdWRpdCBmaW5kaW5nIEgzKS4AAAAHdXBncmFkZQAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAADW5ld193YXNtX2hhc2gAAAAAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAAAAAAAIY2xhaW1fdG8AAAADAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAD6gAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAJc2V0X3Rva2VuAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp0b2tlbl9hZGRyAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAABQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAAAAAAKdGlwX2Ftb3VudAAAAAAACwAAAAAAAAAIdHJlYXN1cnkAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAKdGlwX2Ftb3VudAAAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAHhQdWJsaWMgcmVhZCBvZiBhbiBvcHRpb25hbCBkb25vciBtZXNzYWdlIGF0dGFjaGVkIHRvIGEgZGVwb3NpdC4KUmV0dXJucyBOb25lIGlmIG5vIG1lc3NhZ2Ugd2FzIHByb3ZpZGVkIGF0IGRlcG9zaXQgdGltZS4AAAALZ2V0X21lc3NhZ2UAAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAA+gAAAAQ",
        "AAAAAAAAAAAAAAALdXBkYXRlX3Jvb3QAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhuZXdfcm9vdAAAA+4AAAAgAAAAAA==",
        "AAAAAAAAAAAAAAAMY3VycmVudF9yb290AAAAAAAAAAEAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAMZGVwb3NpdF9wYWlkAAAABAAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAHbWVzc2FnZQAAAAPoAAAAEAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAMdG90YWxfY2xhaW1zAAAAAAAAAAEAAAAE",
        "AAAAAAAAATtBZG1pbi1nYXRlZCBiYXRjaCB3aXRoZHJhd2FsIG9mIGFjY3VtdWxhdGVkIHBsYXRmb3JtIGZlZXMgdG8gdGhlCnRyZWFzdXJ5IGFkZHJlc3MuIERlbGliZXJhdGVseSBzZXBhcmF0ZSBmcm9tIGNsYWltX3RvKCkgYW5kCmNhbGxhYmxlIGF0IGFueSB0aW1lLCBpbmRlcGVuZGVudCBvZiBhbnkgc3BlY2lmaWMgY2xhaW0gLS0gdGhpcwpicmVha3MgdGhlIG9uLWNoYWluIGxpbmsgYmV0d2VlbiAid2hvIGp1c3QgY2xhaW1lZCIgYW5kICJ3aGVuIGRpZAp0aGUgdHJlYXN1cnkgcmVjZWl2ZSBtb25leSIsIHByZXNlcnZpbmcgY2xhaW0tbGV2ZWwgcHJpdmFjeS4AAAAADXdpdGhkcmF3X2ZlZXMAAAAAAAABAAAAAAAAAAVhZG1pbgAAAAAAABMAAAABAAAACw==",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbW1pdG1lbnQAAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAOdG90YWxfZGVwb3NpdHMAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAPdXBkYXRlX3ZlcmlmaWVyAAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAMbmV3X3ZlcmlmaWVyAAAAEwAAAAA=",
        "AAAAAAAAAGRQdWJsaWMgcmVhZCBvZiB0aGUgY3VycmVudCBhY2N1bXVsYXRlZCAobm90LXlldC13aXRoZHJhd24pIGZlZQpiYWxhbmNlLCBmb3IgZGFzaGJvYXJkcy90cmFuc3BhcmVuY3kuAAAAEGFjY3VtdWxhdGVkX2ZlZXMAAAAAAAAAAQAAAAs=",
        "AAAAAAAAAAAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAABAAAAAAAAAA5udWxsaWZpZXJfaGFzaAAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAI9SZXR1cm5zIHRoZSByZWdpc3RlcmVkIHJlY2lwaWVudCBoYXNoLCBvciBOb25lIGlmIG5vdCByZWdpc3RlcmVkLgpSZXR1cm5zIE9wdGlvbiB0byBhdm9pZCBwYW5pY2tpbmcgb24gcmVhZC1vbmx5IHNpbXVsYXRpb24gKGF1ZGl0IGZpbmRpbmcgTDEpLgAAAAASZ2V0X3JlY2lwaWVudF9oYXNoAAAAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAA+gAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAScmVnaXN0ZXJfcmVjaXBpZW50AAAAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAA5yZWNpcGllbnRfaGFzaAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAVZ2V0X2NvbW1pdG1lbnRfYW1vdW50AAAAAAAAAQAAAAAAAAAFaW5kZXgAAAAAAAAEAAAAAQAAAAs="]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<boolean>,
    token: this.txFromJSON<string>,
    upgrade: this.txFromJSON<null>,
    claim_to: this.txFromJSON<boolean>,
    set_token: this.txFromJSON<null>,
    initialize: this.txFromJSON<null>,
    tip_amount: this.txFromJSON<i128>,
    get_message: this.txFromJSON<Option<string>>,
    update_root: this.txFromJSON<null>,
    current_root: this.txFromJSON<Buffer>,
    deposit_paid: this.txFromJSON<u32>,
    total_claims: this.txFromJSON<u32>,
    withdraw_fees: this.txFromJSON<i128>,
    get_commitment: this.txFromJSON<Buffer>,
    total_deposits: this.txFromJSON<u32>,
    update_verifier: this.txFromJSON<null>,
    accumulated_fees: this.txFromJSON<i128>,
    is_nullifier_used: this.txFromJSON<boolean>,
    get_recipient_hash: this.txFromJSON<Option<Buffer>>,
    register_recipient: this.txFromJSON<null>,
    get_commitment_amount: this.txFromJSON<i128>
  }
}