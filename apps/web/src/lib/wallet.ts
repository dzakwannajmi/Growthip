/**
 * wallet.ts — Unified wallet abstraction for Growthip.
 *
 * Wraps @creit.tech/stellar-wallets-kit (v2+ static API).
 * Supports Freighter and xBull.
 */
"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { FREIGHTER_ID, FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { XBULL_ID, xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

let _initialized = false;

function ensureInit() {
  if (_initialized) return;
  StellarWalletsKit.init({
    selectedWalletId: FREIGHTER_ID,
    modules: [
      new FreighterModule(),
      new xBullModule(),
    ],
  });
  _initialized = true;
}

/**
 * Open the wallet auth modal.
 * Resolves with the connected wallet address, or rejects on cancel.
 */
export async function connectWalletModal(): Promise<string> {
  ensureInit();
  const result = await StellarWalletsKit.authModal();
  const { address } = await StellarWalletsKit.getAddress();
  if (typeof window !== "undefined") {
    const walletId = localStorage.getItem("swk-selected-module-id") ?? FREIGHTER_ID;
    localStorage.setItem("growthip:walletId", walletId);
  }
  return address;
}

/**
 * Reconnect silently to the previously selected wallet.
 * Returns the address, or null if not previously connected.
 */
export async function reconnectWallet(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const savedId = localStorage.getItem("growthip:walletId");
  if (!savedId) return null;
  try {
    ensureInit();
    StellarWalletsKit.setWallet(savedId);
    const { address } = await StellarWalletsKit.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

/**
 * Sign a Soroban XDR transaction with the active wallet.
 */
export async function signTransaction(
  xdr: string,
  opts: { address: string; networkPassphrase?: string }
): Promise<{ signedTxXdr: string; signerAddress: string }> {
  ensureInit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
    address: opts.address,
    networkPassphrase: opts.networkPassphrase ?? NETWORK_PASSPHRASE,
  });
  return { signedTxXdr, signerAddress: opts.address };
}

/**
 * Disconnect and clear wallet state.
 */
export async function disconnectWallet(): Promise<void> {
  try {
    ensureInit();
    await StellarWalletsKit.disconnect();
  } catch {}
  if (typeof window !== "undefined") {
    localStorage.removeItem("growthip:walletId");
    localStorage.removeItem("growthip:wallet");
    localStorage.removeItem("growthip:network");
  }
  _initialized = false;
}

/**
 * Get the currently active wallet id.
 */
export function getActiveWalletId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("growthip:walletId");
}

export { FREIGHTER_ID, XBULL_ID };
