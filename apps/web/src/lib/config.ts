/**
 * Centralized contract configuration.
 * All contract IDs and network settings are read from environment variables.
 * To update: change .env.local (local) or Vercel environment variables (production).
 * Never hardcode contract IDs in components.
 */

export const config = {
  pool: {
    /** GrowthipPool V3 — XLM denomination */
    xlm: process.env.NEXT_PUBLIC_POOL_ID!,
    /** GrowthipPool USDC — USDC denomination (deploy separately) */
    usdc: process.env.NEXT_PUBLIC_POOL_USDC_ID ?? "",
    /** GrowthipPool EURC — EURC denomination (deploy separately) */
    eurc: process.env.NEXT_PUBLIC_POOL_EURC_ID ?? "",
  },
  verifier: {
    v3Id: process.env.NEXT_PUBLIC_VERIFIER_V3_ID!,
  },
  token: {
    /** Native XLM Stellar Asset Contract */
    xlm: process.env.NEXT_PUBLIC_TOKEN_ID!,
    /** USDC Stellar Asset Contract (testnet) */
    usdc: process.env.NEXT_PUBLIC_TOKEN_USDC_ID ?? "",
    /** EURC Stellar Asset Contract (testnet) */
    eurc: process.env.NEXT_PUBLIC_TOKEN_EURC_ID ?? "",
  },
  network: {
    name: process.env.NEXT_PUBLIC_NETWORK!,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
    passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
  },
} as const;
