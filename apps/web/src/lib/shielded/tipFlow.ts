// Tip flow (V5): builds the shielded first-time-deposit circuit input and
// drives Groth16 proving, ready for pool-v5 transact().
//
// Reuses ONLY the already-verified modules: keys.ts, noteEncryption.ts,
// extDataHash.ts (cross-checked to the contract), babyjub.ts, poseidon2.ts.
// The witness field order matches transaction2x2.circom (Day 2) exactly — the
// circuit that passed 14/14 tests and a real on-chain E2E (Day 3).
//
// VALUE CONVENTION (confirmed for the deployed pool):
//   ext_amount = tipAmount          (what the supporter transfers in)
//   creator note = tipAmount - fee  (fee goes to ext.relayer on-chain)
//   change note  = 0, locked to a ONE-TIME throwaway keypair
// Value conservation in-circuit: sumIns(0) + publicAmount(tipAmount - fee)
//   === sumOuts((tipAmount - fee) + 0). Verified by test against the circuit.
//
// Why a throwaway change key (not the sender's persistent pkD): supporters need
// no persistent identity to tip, and a zero note to a persistent pkD would link
// every tip from the same supporter to one key in the event log.
//
// Proving is INJECTED via ProveFn so the ~29 MB zkey loads only where the app
// decides — mirror V4 zkp.ts's <script>-tag witness loader to avoid CSP
// unsafe-eval. This module never touches the zkey itself.

import { type Point, SUBGROUP_ORDER, mulBase, randScalar } from "./babyjub";
import { poseidon2 } from "./poseidon2";
import { DOM, DEFAULT_DIVERSIFIER } from "./keys";
import { encryptNoteForRecipient, CIPHERTEXT_LEN } from "./noteEncryption";
import { computeExtDataHash, calcPublicAmount, type ExtDataInput } from "./extDataHash";
import { bytesToBigInt } from "./hex";

const TREE_DEPTH = 20;

const dField = (d: Uint8Array): bigint => bytesToBigInt(d);
const foldPoint = (p: Point, dom: number): Promise<bigint> => poseidon2([p[0], p[1]], dom);

/** Poseidon2([amount, pkdFold, blinding], 0x01) — same as circuit/contract. */
export async function noteCommitment(amount: bigint, pkD: Point, blinding: bigint): Promise<bigint> {
  return poseidon2([amount, await foldPoint(pkD, DOM.PKD), blinding], DOM.COMMIT);
}

/** Fresh CSPRNG blinding, never derived (cross-device collision safety). */
export function randomBlinding(): bigint {
  return randScalar();
}

/** Witness object; names/order match transaction2x2.circom exactly. */
export interface CircuitInput {
  root: string;
  publicAmount: string;
  extDataHash: string;
  domain: string;
  inputNullifier: string[];
  inAmount: string[];
  inAsk: string[];
  inNsk: string[];
  inD: string[];
  inBlinding: string[];
  inPathIndices: string[];
  inPathElements: string[][];
  outputCommitment: string[];
  outAmount: string[];
  outPubkeyAx: string[];
  outPubkeyAy: string[];
  outBlinding: string[];
}

export interface SnarkProofJson {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}

/** Injected prover (V4 zkp.ts-style loader). */
export type ProveFn = (
  input: CircuitInput,
) => Promise<{ proof: SnarkProofJson; publicSignals: string[] }>;

/** Proof in the host BN254 byte layout verified on-chain in Day 3. */
export interface TxProofHex {
  a: string; // G1: x||y
  b: string; // G2: x_c1||x_c0||y_c1||y_c0
  c: string;
  root: string;
  public_amount: string;
  ext_data_hash: string;
  nullifiers: string[];
  commitments: string[];
}

const be32 = (dec: string): string => BigInt(dec).toString(16).padStart(64, "0");
const g1Hex = (p: string[]): string => be32(p[0]) + be32(p[1]);
// snarkjs pi_b = [[x_c0,x_c1],[y_c0,y_c1]]; host wants c1 before c0.
const g2Hex = (p: string[][]): string =>
  be32(p[0][1]) + be32(p[0][0]) + be32(p[1][1]) + be32(p[1][0]);

interface DummyIn {
  nullifier: bigint;
  ask: bigint;
  nsk: bigint;
  blinding: bigint;
}

/** Dummy input: amount 0 (root check disabled in-circuit), throwaway keys. */
async function makeDummyInput(): Promise<DummyIn> {
  const ask = randScalar();
  const nsk = randScalar();
  const nkFold = await foldPoint(await mulBase(nsk), DOM.NK);
  const akFold = await foldPoint(await mulBase(ask), DOM.AK);
  const ivk = (await poseidon2([akFold, nkFold], DOM.IVK)) % SUBGROUP_ORDER;
  const rd = (await poseidon2([dField(DEFAULT_DIVERSIFIER)], DOM.RD)) % SUBGROUP_ORDER;
  const pkD = await mulBase((ivk * rd) % SUBGROUP_ORDER);
  const blinding = randomBlinding();
  const commitment = await noteCommitment(0n, pkD, blinding);
  const nullifier = await poseidon2([commitment, 0n, nkFold], DOM.NULLIFIER);
  return { nullifier, ask, nsk, blinding };
}

/** One-time keypair for the zero-value change note. */
async function throwawayPkD(): Promise<Point> {
  const ask = randScalar();
  const nsk = randScalar();
  const akFold = await foldPoint(await mulBase(ask), DOM.AK);
  const nkFold = await foldPoint(await mulBase(nsk), DOM.NK);
  const ivk = (await poseidon2([akFold, nkFold], DOM.IVK)) % SUBGROUP_ORDER;
  const rd = (await poseidon2([dField(DEFAULT_DIVERSIFIER)], DOM.RD)) % SUBGROUP_ORDER;
  return mulBase((ivk * rd) % SUBGROUP_ORDER);
}

export interface BuildDepositArgs {
  creatorPkD: Point; // from parseAddress("gr1...")
  creatorD: Uint8Array; // diversifier that produced creatorPkD
  tipAmount: bigint; // total the supporter transfers in (= ext_amount)
  fee?: bigint; // relayer fee, default 0; creator receives tipAmount - fee
  poolCurrentRoot: bigint; // live current_root() from poolV5Client
  domain: bigint; // this pool's domain (XLM V5 != USDC V5)
  recipientAddress: string; // ext.recipient
  relayerAddress: string; // ext.relayer
}

export interface BuiltDeposit {
  input: CircuitInput;
  ext: ExtDataInput;
  creatorNoteAmount: bigint; // tipAmount - fee (what the creator can spend)
}

/**
 * Build the full deposit witness + ExtData. Root note: with both inputs dummy
 * the in-circuit root check is disabled, but we bind the pool's LIVE
 * current_root() so transact()'s is_known_root accepts the public input.
 */
export async function buildDepositInput(args: BuildDepositArgs): Promise<BuiltDeposit> {
  const fee = args.fee ?? 0n;
  if (args.tipAmount <= 0n) throw new Error("tipAmount must be positive");
  if (fee < 0n || fee >= args.tipAmount) throw new Error("fee must satisfy 0 <= fee < tipAmount");
  if (args.creatorD.length !== 11) throw new Error("creatorD must be 11 bytes");

  const creatorNoteAmount = args.tipAmount - fee;
  const changePkD = await throwawayPkD();
  const b0 = randomBlinding();
  const b1 = randomBlinding();

  // Ciphertexts BEFORE the hash: they are part of ExtData.
  const enc0 = await encryptNoteForRecipient(args.creatorPkD, args.creatorD, creatorNoteAmount, b0);
  const enc1 = await encryptNoteForRecipient(changePkD, DEFAULT_DIVERSIFIER, 0n, b1);

  const ext: ExtDataInput = {
    extAmount: args.tipAmount,
    fee,
    recipient: args.recipientAddress,
    relayer: args.relayerAddress,
    encryptedOutput0: enc0,
    encryptedOutput1: enc1,
  };
  const extDataHash = computeExtDataHash(ext);
  const publicAmount = calcPublicAmount(ext); // = tipAmount - fee

  const in0 = await makeDummyInput();
  const in1 = await makeDummyInput();
  const outComm0 = await noteCommitment(creatorNoteAmount, args.creatorPkD, b0);
  const outComm1 = await noteCommitment(0n, changePkD, b1);

  const zeroPath = new Array<string>(TREE_DEPTH).fill("0");
  const input: CircuitInput = {
    root: args.poolCurrentRoot.toString(),
    publicAmount: publicAmount.toString(),
    extDataHash: extDataHash.toString(),
    domain: args.domain.toString(),
    inputNullifier: [in0.nullifier.toString(), in1.nullifier.toString()],
    inAmount: ["0", "0"],
    inAsk: [in0.ask.toString(), in1.ask.toString()],
    inNsk: [in0.nsk.toString(), in1.nsk.toString()],
    inD: [dField(DEFAULT_DIVERSIFIER).toString(), dField(DEFAULT_DIVERSIFIER).toString()],
    inBlinding: [in0.blinding.toString(), in1.blinding.toString()],
    inPathIndices: ["0", "0"],
    inPathElements: [zeroPath, [...zeroPath]],
    outputCommitment: [outComm0.toString(), outComm1.toString()],
    outAmount: [creatorNoteAmount.toString(), "0"],
    outPubkeyAx: [args.creatorPkD[0].toString(), changePkD[0].toString()],
    outPubkeyAy: [args.creatorPkD[1].toString(), changePkD[1].toString()],
    outBlinding: [b0.toString(), b1.toString()],
  };

  return { input, ext, creatorNoteAmount };
}

/** Prove and encode for transact(). The SAME ext object must be passed on. */
export async function generateTipProof(
  built: BuiltDeposit,
  prove: ProveFn,
): Promise<{ proof: TxProofHex; ext: ExtDataInput }> {
  for (const c of [built.ext.encryptedOutput0, built.ext.encryptedOutput1]) {
    if (c.length !== CIPHERTEXT_LEN) throw new Error("unexpected ciphertext length");
  }
  const { proof } = await prove(built.input);
  return {
    proof: {
      a: g1Hex(proof.pi_a),
      b: g2Hex(proof.pi_b),
      c: g1Hex(proof.pi_c),
      root: be32(built.input.root),
      public_amount: be32(built.input.publicAmount),
      ext_data_hash: be32(built.input.extDataHash),
      nullifiers: built.input.inputNullifier.map(be32),
      commitments: built.input.outputCommitment.map(be32),
    },
    ext: built.ext,
  };
}
