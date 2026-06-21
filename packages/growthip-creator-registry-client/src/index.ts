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
    contractId: "CDX52ACO6MVXDBC4IS3AG6NIKQASJLY24BED3S5KJEA4PPPAXTWSRGNU",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Token", values: void} | {tag: "Treasury", values: void} | {tag: "PremiumFee", values: void} | {tag: "AccumulatedFee", values: void} | {tag: "EncryptionPubKey", values: readonly [string]} | {tag: "PremiumActivated", values: readonly [string]};


export interface Client {
  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * One-time setup. `token_addr` is the asset premium fees are paid in
   * (the native XLM SAC, in Growthip's case -- premium status is global
   * regardless of which token(s) a creator later receives tips through).
   */
  initialize: ({admin, token_addr, treasury}: {admin: string, token_addr: string, treasury: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a is_premium transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of a creator's premium status. Gates private-note
   * delivery on /tip/[id] and dashboard analytics, client-side.
   */
  is_premium: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a premium_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of the current premium activation fee.
   */
  premium_fee: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a withdraw_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-gated batch withdrawal of accumulated premium fees to the
   * treasury. Unlike growthip-pool's withdraw_fees(), there is no
   * privacy reason to delay this -- premium activation already reveals
   * the creator's identity via their own signed transaction. Kept as a
   * batch-withdraw pattern anyway for consistency with the rest of the
   * codebase and to keep per-activation gas cost minimal (no extra
   * transfer to treasury on every single activation).
   */
  withdraw_fees: ({admin}: {admin: string}, options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a accumulated_fees transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of pending (not yet withdrawn) accumulated fees.
   */
  accumulated_fees: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a update_premium_fee transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Admin-gated: adjust the premium activation fee post-deploy, without
   * a full contract redeploy.
   */
  update_premium_fee: ({admin, new_fee}: {admin: string, new_fee: i128}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_encryption_pubkey transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Public read of a creator's encryption public key, if registered.
   * Used by a supporter's browser to encrypt a private note.
   */
  get_encryption_pubkey: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Option<Buffer>>>

  /**
   * Construct and simulate a register_encryption_pubkey transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Registers (or rotates) a creator's encryption public key.
   * 
   * First call for a given `recipient`: charges the one-time premium
   * fee (transferred from `recipient` to this contract, accrued for
   * later batch withdrawal via withdraw_fees()) and marks them premium
   * forever.
   * 
   * Subsequent calls (e.g. rotating to a new key after setting up a new
   * device via recovery phrase): free -- premium status, once paid for,
   * is not re-charged for key rotation.
   */
  register_encryption_pubkey: ({recipient, pubkey}: {recipient: string, pubkey: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAABwAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAFVG9rZW4AAAAAAAAAAAAAAAAAAAhUcmVhc3VyeQAAAAAAAAAAAAAAClByZW1pdW1GZWUAAAAAAAAAAAAAAAAADkFjY3VtdWxhdGVkRmVlAAAAAAABAAAAAAAAABBFbmNyeXB0aW9uUHViS2V5AAAAAQAAABMAAAABAAAAAAAAABBQcmVtaXVtQWN0aXZhdGVkAAAAAQAAABM=",
        "AAAABQAAAP1FbWl0dGVkIHdoZW4gYSBjcmVhdG9yIGFjdGl2YXRlcyBwcmVtaXVtIGZvciB0aGUgZmlyc3QgdGltZS4gUHJpdmFjeS0Kc2FmZSBieSBjb25zdHJ1Y3Rpb246IGFjdGl2YXRpbmcgcHJlbWl1bSBhbHJlYWR5IHJlcXVpcmVzIHRoZQpjcmVhdG9yJ3Mgb3duIHNpZ25hdHVyZSAocmVxdWlyZV9hdXRoKSwgc28gdGhlcmUgaXMgbm8gYWRkaXRpb25hbAphbm9ueW1pdHkgdG8gcHJvdGVjdCBoZXJlLCB1bmxpa2UgcG9vbCBkZXBvc2l0cy9jbGFpbXMuAAAAAAAAAAAAABVQcmVtaXVtQWN0aXZhdGVkRXZlbnQAAAAAAAABAAAAEXByZW1pdW1fYWN0aXZhdGVkAAAAAAAAAQAAAAAAAAAJcmVjaXBpZW50AAAAAAAAEwAAAAAAAAAA",
        "AAAAAAAAAMtPbmUtdGltZSBzZXR1cC4gYHRva2VuX2FkZHJgIGlzIHRoZSBhc3NldCBwcmVtaXVtIGZlZXMgYXJlIHBhaWQgaW4KKHRoZSBuYXRpdmUgWExNIFNBQywgaW4gR3Jvd3RoaXAncyBjYXNlIC0tIHByZW1pdW0gc3RhdHVzIGlzIGdsb2JhbApyZWdhcmRsZXNzIG9mIHdoaWNoIHRva2VuKHMpIGEgY3JlYXRvciBsYXRlciByZWNlaXZlcyB0aXBzIHRocm91Z2gpLgAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp0b2tlbl9hZGRyAAAAAAATAAAAAAAAAAh0cmVhc3VyeQAAABMAAAAA",
        "AAAAAAAAAHlQdWJsaWMgcmVhZCBvZiBhIGNyZWF0b3IncyBwcmVtaXVtIHN0YXR1cy4gR2F0ZXMgcHJpdmF0ZS1ub3RlCmRlbGl2ZXJ5IG9uIC90aXAvW2lkXSBhbmQgZGFzaGJvYXJkIGFuYWx5dGljcywgY2xpZW50LXNpZGUuAAAAAAAACmlzX3ByZW1pdW0AAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAAAQ==",
        "AAAAAAAAADJQdWJsaWMgcmVhZCBvZiB0aGUgY3VycmVudCBwcmVtaXVtIGFjdGl2YXRpb24gZmVlLgAAAAAAC3ByZW1pdW1fZmVlAAAAAAAAAAABAAAACw==",
        "AAAAAAAAAbdBZG1pbi1nYXRlZCBiYXRjaCB3aXRoZHJhd2FsIG9mIGFjY3VtdWxhdGVkIHByZW1pdW0gZmVlcyB0byB0aGUKdHJlYXN1cnkuIFVubGlrZSBncm93dGhpcC1wb29sJ3Mgd2l0aGRyYXdfZmVlcygpLCB0aGVyZSBpcyBubwpwcml2YWN5IHJlYXNvbiB0byBkZWxheSB0aGlzIC0tIHByZW1pdW0gYWN0aXZhdGlvbiBhbHJlYWR5IHJldmVhbHMKdGhlIGNyZWF0b3IncyBpZGVudGl0eSB2aWEgdGhlaXIgb3duIHNpZ25lZCB0cmFuc2FjdGlvbi4gS2VwdCBhcyBhCmJhdGNoLXdpdGhkcmF3IHBhdHRlcm4gYW55d2F5IGZvciBjb25zaXN0ZW5jeSB3aXRoIHRoZSByZXN0IG9mIHRoZQpjb2RlYmFzZSBhbmQgdG8ga2VlcCBwZXItYWN0aXZhdGlvbiBnYXMgY29zdCBtaW5pbWFsIChubyBleHRyYQp0cmFuc2ZlciB0byB0cmVhc3VyeSBvbiBldmVyeSBzaW5nbGUgYWN0aXZhdGlvbikuAAAAAA13aXRoZHJhd19mZWVzAAAAAAAAAQAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAQAAAAs=",
        "AAAAAAAAADxQdWJsaWMgcmVhZCBvZiBwZW5kaW5nIChub3QgeWV0IHdpdGhkcmF3bikgYWNjdW11bGF0ZWQgZmVlcy4AAAAQYWNjdW11bGF0ZWRfZmVlcwAAAAAAAAABAAAACw==",
        "AAAAAAAAAF1BZG1pbi1nYXRlZDogYWRqdXN0IHRoZSBwcmVtaXVtIGFjdGl2YXRpb24gZmVlIHBvc3QtZGVwbG95LCB3aXRob3V0CmEgZnVsbCBjb250cmFjdCByZWRlcGxveS4AAAAAAAASdXBkYXRlX3ByZW1pdW1fZmVlAAAAAAACAAAAAAAAAAVhZG1pbgAAAAAAABMAAAAAAAAAB25ld19mZWUAAAAACwAAAAA=",
        "AAAAAAAAAHlQdWJsaWMgcmVhZCBvZiBhIGNyZWF0b3IncyBlbmNyeXB0aW9uIHB1YmxpYyBrZXksIGlmIHJlZ2lzdGVyZWQuClVzZWQgYnkgYSBzdXBwb3J0ZXIncyBicm93c2VyIHRvIGVuY3J5cHQgYSBwcml2YXRlIG5vdGUuAAAAAAAAFWdldF9lbmNyeXB0aW9uX3B1YmtleQAAAAAAAAEAAAAAAAAACXJlY2lwaWVudAAAAAAAABMAAAABAAAD6AAAA+4AAAAg",
        "AAAAAAAAAbRSZWdpc3RlcnMgKG9yIHJvdGF0ZXMpIGEgY3JlYXRvcidzIGVuY3J5cHRpb24gcHVibGljIGtleS4KCkZpcnN0IGNhbGwgZm9yIGEgZ2l2ZW4gYHJlY2lwaWVudGA6IGNoYXJnZXMgdGhlIG9uZS10aW1lIHByZW1pdW0KZmVlICh0cmFuc2ZlcnJlZCBmcm9tIGByZWNpcGllbnRgIHRvIHRoaXMgY29udHJhY3QsIGFjY3J1ZWQgZm9yCmxhdGVyIGJhdGNoIHdpdGhkcmF3YWwgdmlhIHdpdGhkcmF3X2ZlZXMoKSkgYW5kIG1hcmtzIHRoZW0gcHJlbWl1bQpmb3JldmVyLgoKU3Vic2VxdWVudCBjYWxscyAoZS5nLiByb3RhdGluZyB0byBhIG5ldyBrZXkgYWZ0ZXIgc2V0dGluZyB1cCBhIG5ldwpkZXZpY2UgdmlhIHJlY292ZXJ5IHBocmFzZSk6IGZyZWUgLS0gcHJlbWl1bSBzdGF0dXMsIG9uY2UgcGFpZCBmb3IsCmlzIG5vdCByZS1jaGFyZ2VkIGZvciBrZXkgcm90YXRpb24uAAAAGnJlZ2lzdGVyX2VuY3J5cHRpb25fcHVia2V5AAAAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAZwdWJrZXkAAAAAA+4AAAAgAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    initialize: this.txFromJSON<null>,
        is_premium: this.txFromJSON<boolean>,
        premium_fee: this.txFromJSON<i128>,
        withdraw_fees: this.txFromJSON<i128>,
        accumulated_fees: this.txFromJSON<i128>,
        update_premium_fee: this.txFromJSON<null>,
        get_encryption_pubkey: this.txFromJSON<Option<Buffer>>,
        register_encryption_pubkey: this.txFromJSON<null>
  }
}