// zkpV5.ts
// Browser-side Groth16 proof generation for Growthip V5 tip flow.

import { groth16 } from "snarkjs";
import { type ProveFn, type CircuitInput } from "./tipFlow";

const WASM_PATH = "/circuits/transaction2x2.wasm";
const ZKEY_PATH = "/circuits/transaction2x2.zkey";
const VK_PATH = "/circuits/verification_key.json";
const WITNESS_CALCULATOR_PATH = "/circuits/witness_calculator.js";

let witnessCalculatorFactory: any = null;
async function loadWitnessCalculatorFactory() {
  if (witnessCalculatorFactory) return witnessCalculatorFactory;
  const w = window as unknown as { module?: { exports: unknown } };
  w.module = { exports: {} };
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = WITNESS_CALCULATOR_PATH;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load witness_calculator.js"));
    document.head.appendChild(script);
  });
  witnessCalculatorFactory = w.module!.exports;
  delete w.module;
  return witnessCalculatorFactory;
}

async function fetchWasmBytes(): Promise<Uint8Array> {
  const res = await fetch(WASM_PATH);
  if (!res.ok) throw new Error(`Failed to load circuit WASM`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchZkeyBytes(): Promise<Uint8Array> {
  const res = await fetch(ZKEY_PATH);
  if (!res.ok) throw new Error(`Failed to load proving key`);
  return new Uint8Array(await res.arrayBuffer());
}

export const proveV5: ProveFn = async (input: CircuitInput) => {
  if (typeof window === "undefined") throw new Error("proveV5 must run in the browser.");

  const [wasmBytes, factory, zkeyBytes] = await Promise.all([
    fetchWasmBytes(),
    loadWitnessCalculatorFactory(),
    fetchZkeyBytes(),
  ]);

  const wc = await factory(wasmBytes);
  const wtnsBin = await wc.calculateWTNSBin(input, 0);

  // Return the raw snarkjs proof as expected by tipFlow.ts ProveFn
  const { proof, publicSignals } = await groth16.prove(zkeyBytes, wtnsBin);

  const vkRes = await fetch(VK_PATH);
  if (!vkRes.ok) throw new Error("Failed to load verification_key.json");
  const vk = await vkRes.json();
  
  if (!(await groth16.verify(vk, publicSignals, proof))) {
     throw new Error("Proof failed local verification!");
  }

  // Cast to any to bypass strict type matching if SnarkProofJson structure varies slightly
  return { proof: proof as any, publicSignals };
};
