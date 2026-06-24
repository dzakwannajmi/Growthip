/**
 * wallet.ts — Unified wallet abstraction for Growthip.
 * Supports Freighter and xBull only.
 */
"use client";

import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { FREIGHTER_ID, FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { XBULL_ID, xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

let _initialized = false;

export const SUPPORTED_WALLETS = [
  {
    id: FREIGHTER_ID,
    name: "Freighter",
    description: "Browser extension for Stellar",
    icon: "ph:wallet-bold",
    installUrl: "https://www.freighter.app",
  },
  {
    id: XBULL_ID,
    name: "xBull Wallet",
    description: "Secure wallet & multi-platform",
    icon: "ph:shield-bold",
    installUrl: "https://xbull.app",
  },
];

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
 * Connect with a specific wallet id directly (no modal).
 */
export async function connectWithWallet(walletId: string): Promise<string> {
  ensureInit();
  StellarWalletsKit.setWallet(walletId);
  const { address } = await StellarWalletsKit.fetchAddress();
  if (typeof window !== "undefined") {
    localStorage.setItem("growthip:walletId", walletId);
  }
  return address;
}

/**
 * Open the wallet selection modal (uses custom UI via WalletModal component).
 * This is kept for compatibility — prefer connectWithWallet directly.
 */
export async function connectWalletModal(): Promise<string> {
  // This will be triggered via WalletModal component
  // which calls connectWithWallet(walletId) directly.
  throw new Error("Use WalletModal component instead");
}

/**
 * Reconnect silently to the previously selected wallet.
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

export function getActiveWalletId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("growthip:walletId");
}

export { FREIGHTER_ID, XBULL_ID };
