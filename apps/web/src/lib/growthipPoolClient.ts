/* eslint-disable */
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
    contractId: "CCSYSAWOUWWBAHDLXXBZ4NL7VIXGCHAMYWNZHNUVUQQUMY4TSGC6IV56",
  }
} as const

export type DataKey = {tag: "Admin", values: void} | {tag: "Verifier", values: void} | {tag: "Token", values: void} | {tag: "CurrentRoot", values: void} | {tag: "RecipientHash", values: readonly [string]} | {tag: "NullifierUsed", values: readonly [Buffer]} | {tag: "Commitment", values: readonly [u32]} | {tag: "TotalDeposits", values: void} | {tag: "TotalClaims", values: void};


export interface Groth16Proof {
  a: Buffer;
  b: Buffer;
  c: Buffer;
}

export interface Client {
  /**
   * Construct and simulate a claim transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim: ({proof_bytes, public_inputs}: {proof_bytes: Buffer, public_inputs: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a deposit transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit: ({commitment}: {commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a claim_to transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  claim_to: ({recipient, proof_bytes, public_inputs}: {recipient: string, proof_bytes: Buffer, public_inputs: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a set_token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  set_token: ({admin, token_addr}: {admin: string, token_addr: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a initialize transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  initialize: ({admin, verifier, root}: {admin: string, verifier: string, root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a tip_amount transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  tip_amount: (options?: MethodOptions) => Promise<AssembledTransaction<i128>>

  /**
   * Construct and simulate a update_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  update_root: ({admin, new_root}: {admin: string, new_root: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a current_root transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  current_root: (options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a deposit_paid transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  deposit_paid: ({depositor, commitment}: {depositor: string, commitment: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a total_claims transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_claims: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a get_commitment transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_commitment: ({index}: {index: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a total_deposits transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  total_deposits: (options?: MethodOptions) => Promise<AssembledTransaction<u32>>

  /**
   * Construct and simulate a is_nullifier_used transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  is_nullifier_used: ({nullifier_hash}: {nullifier_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

  /**
   * Construct and simulate a get_recipient_hash transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_recipient_hash: ({recipient}: {recipient: string}, options?: MethodOptions) => Promise<AssembledTransaction<Buffer>>

  /**
   * Construct and simulate a register_recipient transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  register_recipient: ({recipient, recipient_hash}: {recipient: string, recipient_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a verify transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  verify: ({proof_bytes, public_inputs}: {proof_bytes: Buffer, public_inputs: Array<Buffer>}, options?: MethodOptions) => Promise<AssembledTransaction<boolean>>

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
      new ContractSpec([ "AAAAAgAAAAAAAAAAAAAAB0RhdGFLZXkAAAAACQAAAAAAAAAAAAAABUFkbWluAAAAAAAAAAAAAAAAAAAIVmVyaWZpZXIAAAAAAAAAAAAAAAVUb2tlbgAAAAAAAAAAAAAAAAAAC0N1cnJlbnRSb290AAAAAAEAAAAAAAAADVJlY2lwaWVudEhhc2gAAAAAAAABAAAAEwAAAAEAAAAAAAAADU51bGxpZmllclVzZWQAAAAAAAABAAAD7gAAACAAAAABAAAAAAAAAApDb21taXRtZW50AAAAAAABAAAABAAAAAAAAAAAAAAADVRvdGFsRGVwb3NpdHMAAAAAAAAAAAAAAAAAAAtUb3RhbENsYWltcwA=",
        "AAAAAAAAAAAAAAAFY2xhaW0AAAAAAAACAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAD6gAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAAAAAAAHZGVwb3NpdAAAAAABAAAAAAAAAApjb21taXRtZW50AAAAAAPuAAAAIAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAIY2xhaW1fdG8AAAADAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAD6gAAA+4AAAAgAAAAAQAAAAE=",
        "AAAAAAAAAAAAAAAJc2V0X3Rva2VuAAAAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAp0b2tlbl9hZGRyAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAAKaW5pdGlhbGl6ZQAAAAAAAwAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAh2ZXJpZmllcgAAABMAAAAAAAAABHJvb3QAAAPuAAAAIAAAAAA=",
        "AAAAAAAAAAAAAAAKdGlwX2Ftb3VudAAAAAAAAAAAAAEAAAAL",
        "AAAAAAAAAAAAAAALdXBkYXRlX3Jvb3QAAAAAAgAAAAAAAAAFYWRtaW4AAAAAAAATAAAAAAAAAAhuZXdfcm9vdAAAA+4AAAAgAAAAAA==",
        "AAAAAAAAAAAAAAAMY3VycmVudF9yb290AAAAAAAAAAEAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAMZGVwb3NpdF9wYWlkAAAAAgAAAAAAAAAJZGVwb3NpdG9yAAAAAAAAEwAAAAAAAAAKY29tbWl0bWVudAAAAAAD7gAAACAAAAABAAAABA==",
        "AAAAAAAAAAAAAAAMdG90YWxfY2xhaW1zAAAAAAAAAAEAAAAE",
        "AAAAAAAAAAAAAAAOZ2V0X2NvbW1pdG1lbnQAAAAAAAEAAAAAAAAABWluZGV4AAAAAAAABAAAAAEAAAPuAAAAIA==",
        "AAAAAAAAAAAAAAAOdG90YWxfZGVwb3NpdHMAAAAAAAAAAAABAAAABA==",
        "AAAAAAAAAAAAAAARaXNfbnVsbGlmaWVyX3VzZWQAAAAAAAABAAAAAAAAAA5udWxsaWZpZXJfaGFzaAAAAAAD7gAAACAAAAABAAAAAQ==",
        "AAAAAAAAAAAAAAASZ2V0X3JlY2lwaWVudF9oYXNoAAAAAAABAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAQAAA+4AAAAg",
        "AAAAAAAAAAAAAAAScmVnaXN0ZXJfcmVjaXBpZW50AAAAAAACAAAAAAAAAAlyZWNpcGllbnQAAAAAAAATAAAAAAAAAA5yZWNpcGllbnRfaGFzaAAAAAAD7gAAACAAAAAA",
        "AAAAAQAAAAAAAAAAAAAADEdyb3RoMTZQcm9vZgAAAAMAAAAAAAAAAWEAAAAAAAPuAAAAQAAAAAAAAAABYgAAAAAAA+4AAACAAAAAAAAAAAFjAAAAAAAD7gAAAEA=",
        "AAAAAAAAAAAAAAAGdmVyaWZ5AAAAAAACAAAAAAAAAAtwcm9vZl9ieXRlcwAAAAAOAAAAAAAAAA1wdWJsaWNfaW5wdXRzAAAAAAAD6gAAA+4AAAAgAAAAAQAAAAE=" ]),
      options
    )
  }
  public readonly fromJSON = {
    claim: this.txFromJSON<boolean>,
        token: this.txFromJSON<string>,
        deposit: this.txFromJSON<u32>,
        claim_to: this.txFromJSON<boolean>,
        set_token: this.txFromJSON<null>,
        initialize: this.txFromJSON<null>,
        tip_amount: this.txFromJSON<i128>,
        update_root: this.txFromJSON<null>,
        current_root: this.txFromJSON<Buffer>,
        deposit_paid: this.txFromJSON<u32>,
        total_claims: this.txFromJSON<u32>,
        get_commitment: this.txFromJSON<Buffer>,
        total_deposits: this.txFromJSON<u32>,
        is_nullifier_used: this.txFromJSON<boolean>,
        get_recipient_hash: this.txFromJSON<Buffer>,
        register_recipient: this.txFromJSON<null>,
        verify: this.txFromJSON<boolean>
  }
}