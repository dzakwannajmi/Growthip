/**
 * zkp.ts
 *
 * Browser-side Groth16 proof generation for Growthip V3.
 *
 * Pipeline:
 *   1. Build the circuit input from the PrivateNote + Merkle path.
 *   2. Compute the witness with the circuit's witness_calculator.js + WASM.
 *   3. Generate the Groth16 proof with snarkjs (using the .zkey).
 *   4. Serialize the proof + public inputs to the exact byte layout the
 *      Soroban verifier expects.
 *
 * Soroban proof layout (256 bytes total):
 *   G1_A (64)  = x(32) || y(32)
 *   G2_B (128) = x_imag(32) || x_real(32) || y_imag(32) || y_real(32)
 *   G1_C (64)  = x(32) || y(32)
 * All coordinates are 32-byte big-endian.
 *
 * G2 ordering note (matches scripts/convert_growthip_merkle_note_v3_snarkjs.js):
 *   snarkjs stores Fp2 as [real, imag] => [pt[0], pt[1]].
 *   Soroban expects [imag, real]. So for pi_b = [[a,b],[c,d],[..]]:
 *     x: pt[0][1], pt[0][0]   (b, a)
 *     y: pt[1][1], pt[1][0]   (d, c)
 *
 * Public inputs layout (96 bytes = 3 x 32):
 *   [root, nullifierHash, recipientHash], each 32-byte big-endian.
 *
 * All ZK operations are client-side only. Nothing is sent to a server.
 */

import { groth16 } from "snarkjs";
import { Buffer } from "buffer";
import type { PrivateNote } from "@/lib/note"; // adjust import to your project
import type { MerklePath } from "./merkle";

/** Public artifact paths (copied into apps/web/public/zkp/). */
const WASM_PATH = "/zkp/growthip_merkle_note_v3_1.wasm";
const ZKEY_PATH = "/zkp/growthip_merkle_note_v3_1_final.zkey";
const WITNESS_CALCULATOR_PATH = "/zkp/witness_calculator_v3_1.js";

/** Circuit input shape (decimal strings, except pathIndices bits). */
interface CircuitInput {
  secret: string;
  nullifier: string;
  pathElements: string[];
  pathIndices: string[];
  recipientHash: string;
}

/** snarkjs Groth16 proof shape (decimal strings). */
interface Groth16Proof {
  pi_a: [string, string, string];
  pi_b: [[string, string], [string, string], [string, string]];
  pi_c: [string, string, string];
  protocol: string;
  curve: string;
}

export interface GeneratedProof {
  /** 512-hex-char (256-byte) proof: G1_A || G2_B || G1_C. */
  proofHex: string;
  /** Four 64-hex-char (32-byte) public inputs: [root, nullifierHash, recipientHash, index]. */
  publicInputsHex: [string, string, string, string];
  /** Raw snarkjs public signals (decimal), in circuit output order. */
  publicSignals: string[];
}

export type ProofProgress =
  | "loading-wasm"
  | "computing-witness"
  | "generating-proof"
  | "serializing"
  | "done";

/* ------------------------------------------------------------------ */
/* Hex serialization (mirrors the proven convert script)              */
/* ------------------------------------------------------------------ */

/** Convert a decimal field element to 32-byte big-endian hex (64 chars). */
function to32ByteHex(decimalString: string): string {
  const hex = BigInt(decimalString).toString(16);
  if (hex.length > 64) {
    throw new Error(`Field element too large: ${decimalString}`);
  }
  return hex.padStart(64, "0");
}

/** G1 point -> 128 hex chars: x || y. */
function g1Hex(point: [string, string, string]): string {
  return to32ByteHex(point[0]) + to32ByteHex(point[1]);
}

/**
 * G2 point -> 256 hex chars in Soroban order: x_imag || x_real || y_imag || y_real.
 * snarkjs point = [[x_real, x_imag], [y_real, y_imag], [..]].
 */
function g2Hex(point: [[string, string], [string, string], [string, string]]): string {
  return (
    to32ByteHex(point[0][1]) + // x imaginary
    to32ByteHex(point[0][0]) + // x real
    to32ByteHex(point[1][1]) + // y imaginary
    to32ByteHex(point[1][0]) //   y real
  );
}

/* ------------------------------------------------------------------ */
/* WASM + witness calculator loading (lazy, browser-only)             */
/* ------------------------------------------------------------------ */

let witnessCalculatorFactory:
  | ((wasm: ArrayBuffer | Uint8Array) => Promise<WitnessCalculator>)
  | null = null;

interface WitnessCalculator {
  calculateWTNSBin(input: CircuitInput, sanityCheck: number): Promise<Uint8Array>;
}

/**
 * Dynamically import the circuit's witness_calculator.js from /public.
 * It is a UMD/CommonJS module exporting a factory; we load it as a module
 * script at runtime so it never enters the SSR bundle.
 */
async function loadWitnessCalculatorFactory(): Promise<
  (wasm: ArrayBuffer | Uint8Array) => Promise<WitnessCalculator>
> {
  if (witnessCalculatorFactory) return witnessCalculatorFactory;

  // witness_calculator.js uses `module.exports = ...`. Rather than
  // evaluating the source as a string via `new Function(...)` (which is
  // functionally identical to eval() and is blocked by a CSP without
  // 'unsafe-eval' -- a much broader permission than this narrow use case
  // needs), we inject it as a real <script> tag. Real <script> tags are
  // permitted by `script-src 'self'` without requiring 'unsafe-eval' at
  // all, since the browser treats them as ordinary same-origin script
  // loading, not dynamic code evaluation.
  //
  // The script assigns to `module.exports`, so we provide `window.module`
  // as a temporary global the script can write to, then read it back and
  // clean up immediately afterward to avoid polluting global scope.
  const w = window as unknown as { module?: { exports: unknown } };
  w.module = { exports: {} };

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WITNESS_CALCULATOR_PATH;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load witness_calculator.js"));
    document.head.appendChild(script);
  });

  witnessCalculatorFactory = w.module!.exports as (
    wasm: ArrayBuffer | Uint8Array,
  ) => Promise<WitnessCalculator>;

  delete w.module;

  return witnessCalculatorFactory;
}

async function fetchWasmBytes(): Promise<Uint8Array> {
  const res = await fetch(WASM_PATH);
  if (!res.ok) throw new Error(`Failed to load circuit WASM (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchZkeyBytes(): Promise<Uint8Array> {
  const res = await fetch(ZKEY_PATH);
  if (!res.ok) throw new Error(`Failed to load proving key (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Build the circuit input from a PrivateNote and its Merkle path.
 * The note must carry the original `secret`, `nullifier`, and `recipientHash`
 * (decimal strings). recipientHash is a PRIVATE input in V3.
 */
function buildCircuitInput(
  note: PrivateNote,
  merklePath: MerklePath,
): CircuitInput {
  if (merklePath.pathElements.length !== 3 || merklePath.pathIndices.length !== 3) {
    throw new Error("Merkle path must have exactly 3 elements (tree depth 3).");
  }
  return {
    secret: note.secret,
    nullifier: note.nullifier,
    pathElements: merklePath.pathElements,
    pathIndices: merklePath.pathIndices,
    recipientHash: note.recipientHash,
  };
}

/**
 * Generate a Groth16 proof for the given note + Merkle path, fully client-side.
 *
 * @param note       The PrivateNote (holds secret/nullifier/recipientHash).
 * @param merklePath The Merkle path for the note's commitment.
 * @param onProgress Optional callback for UI progress states.
 */
export async function generateProof(
  note: PrivateNote,
  merklePath: MerklePath,
  onProgress?: (stage: ProofProgress) => void,
): Promise<GeneratedProof> {
  if (typeof window === "undefined") {
    throw new Error("generateProof must run in the browser.");
  }

  const input = buildCircuitInput(note, merklePath);

  // 1. Load WASM + witness calculator.
  onProgress?.("loading-wasm");
  const [wasmBytes, factory, zkeyBytes] = await Promise.all([
    fetchWasmBytes(),
    loadWitnessCalculatorFactory(),
    fetchZkeyBytes(),
  ]);

  // 2. Compute the witness binary.
  onProgress?.("computing-witness");
  const wc = await factory(wasmBytes);
  const wtnsBin = await wc.calculateWTNSBin(input, 0);

  // 3. Generate the proof from the witness + proving key.
  onProgress?.("generating-proof");
  const { proof, publicSignals } = (await groth16.prove(
    zkeyBytes,
    wtnsBin,
  )) as { proof: Groth16Proof; publicSignals: string[] };

  // 4. Serialize.
  onProgress?.("serializing");
  if (proof.protocol !== "groth16") {
    throw new Error(`Expected groth16 proof, got ${proof.protocol}`);
  }
  if (publicSignals.length !== 4) {
    throw new Error(
      `Expected 4 public signals [root, nullifierHash, recipientHash, index], got ${publicSignals.length}`,
    );
  }

  const proofHex = g1Hex(proof.pi_a) + g2Hex(proof.pi_b) + g1Hex(proof.pi_c);
  if (proofHex.length !== 512) {
    throw new Error(`Expected proof hex length 512, got ${proofHex.length}`);
  }

  const publicInputsHex = publicSignals.map(to32ByteHex) as [
    string,
    string,
    string,
    string,
  ];

  onProgress?.("done");
  return { proofHex, publicInputsHex, publicSignals };
}

/**
 * Convert hex to a Node-style Buffer, which is what the generated Soroban
 * contract client (growthipPoolClient.ts) expects for BytesN / Bytes fields.
 * `buffer` is polyfilled onto window in growthipPoolClient.ts.
 */
export function hexToBuffer(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
}

/** Build the exact arguments for `client.claim_to`. */
export function toClaimArgs(generated: GeneratedProof): {
  proof_bytes: Buffer;
  public_inputs: Buffer[];
} {
  return {
    proof_bytes: hexToBuffer(generated.proofHex),
    public_inputs: generated.publicInputsHex.map(hexToBuffer),
  };
}