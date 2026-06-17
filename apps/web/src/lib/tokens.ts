/**
 * Supported tokens for Growthip tipping.
 * Each token maps to its own pool contract (one pool per token).
 * Pool supports custom amounts: 1x, 5x, 10x, 20x base denomination.
 */

import { config } from "./config";

export type TokenSymbol = "XLM" | "USDC" | "EURC";

export interface Token {
  symbol:      TokenSymbol;
  name:        string;
  contractId:  string;
  poolId:      string;
  decimals:    number;
  /** Base denomination in stroops/base units (1x multiplier) */
  baseUnit:    number;
  /** Human-readable presets: [1x, 5x, 10x, 20x] */
  presets:     number[];
  logoUrl:     string;
  available:   boolean;
}

export const SUPPORTED_TOKENS: Token[] = [
  {
    symbol:     "XLM",
    name:       "Stellar Lumens",
    contractId: config.token.xlm,
    poolId:     config.pool.xlm,
    decimals:   7,
    baseUnit:   10_000_000,   // 1 XLM
    presets:    [1, 5, 10, 20], // XLM amounts
    logoUrl:    "https://assets.coingecko.com/coins/images/100/standard/fmpFRHHQ_400x400.jpg?1735231350",
    available:  true,
  },
  {
    symbol:     "USDC",
    name:       "USD Coin",
    contractId: config.token.usdc,
    poolId:     config.pool.usdc,
    decimals:   7,
    baseUnit:   1_000_000,    // 0.1 USDC
    presets:    [0.1, 0.5, 1, 2], // USDC amounts
    logoUrl:    "https://assets.coingecko.com/coins/images/6319/standard/USDC.png?1769615602",
    available:  config.token.usdc !== "",
  },
  {
    symbol:     "EURC",
    name:       "Euro Coin",
    contractId: config.token.eurc,
    poolId:     config.pool.eurc,
    decimals:   7,
    baseUnit:   1_000_000,    // 0.1 EURC
    presets:    [0.1, 0.5, 1, 2], // EURC amounts
    logoUrl:    "https://assets.coingecko.com/coins/images/26045/standard/EURC.png?1769615705",
    available:  config.token.eurc !== "",
  },
];

export function getToken(symbol: TokenSymbol): Token | undefined {
  return SUPPORTED_TOKENS.find((t) => t.symbol === symbol);
}

export function getAvailableTokens(): Token[] {
  return SUPPORTED_TOKENS.filter((t) => t.available);
}

/** Convert human-readable amount to base units (stroops) */
export function toBaseUnits(amount: number, token: Token): number {
  return Math.round(amount * Math.pow(10, token.decimals));
}

/** Convert base units to human-readable amount */
export function fromBaseUnits(amount: number, token: Token): number {
  return amount / Math.pow(10, token.decimals);
}

/** Format amount for display */
export function formatAmount(amount: number, token: Token): string {
  const human = fromBaseUnits(amount, token);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

/** Get contract amount (stroops) from preset display amount */
export function presetToContractAmount(preset: number, token: Token): number {
  return Math.round(preset * Math.pow(10, token.decimals));
}
