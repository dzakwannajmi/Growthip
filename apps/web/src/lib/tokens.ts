/**
 * Supported tokens for Growthip tipping.
 * Each token maps to its own pool contract (one pool per token).
 * Pool addresses are read from environment variables via config.ts.
 */

import { config } from "./config";

export type TokenSymbol = "XLM" | "USDC" | "EURC";

export interface Token {
  symbol:     TokenSymbol;
  name:       string;
  /** Stellar Asset Contract address */
  contractId: string;
  /** Growthip pool contract for this token */
  poolId:     string;
  decimals:   number;
  /** Fixed tip amount in base units (as number, not BigInt) */
  tipAmount:  number;
  logoUrl:    string;
  available:  boolean;
}

export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol:     "XLM",
    name:       "Stellar Lumens",
    contractId: config.token.xlm,
    poolId:     config.pool.xlm,
    decimals:   7,
    tipAmount:  100_000_000, // 10 XLM in stroops
    logoUrl:    "https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png",
    available:  true,
  },
  {
    symbol:     "USDC",
    name:       "USD Coin",
    contractId: config.token.usdc,
    poolId:     config.pool.usdc,
    decimals:   7,
    tipAmount:  10_000_000, // 1 USDC in base units
    logoUrl:    "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
    available:  config.token.usdc !== "",
  },
  {
    symbol:     "EURC",
    name:       "Euro Coin",
    contractId: config.token.eurc,
    poolId:     config.pool.eurc,
    decimals:   7,
    tipAmount:  10_000_000, // 1 EURC in base units
    logoUrl:    "https://assets.coingecko.com/coins/images/26045/small/euro-coin.png",
    available:  config.token.eurc !== "",
  },
];

/** Get token by symbol. Returns undefined if not found. */
export function getToken(symbol: TokenSymbol): Token | undefined {
  return SUPPORTED_TOKENS.find((t) => t.symbol === symbol);
}

/** Get all currently available tokens. */
export function getAvailableTokens(): Token[] {
  return SUPPORTED_TOKENS.filter((t) => t.available);
}

/** Format amount from base units to human-readable string. */
export function formatAmount(amount: number, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  const whole   = Math.floor(amount / divisor);
  const frac    = amount % divisor;
  if (frac === 0) return whole.toString();
  return `${whole}.${String(frac).padStart(decimals, "0").replace(/0+$/, "")}`;
}
