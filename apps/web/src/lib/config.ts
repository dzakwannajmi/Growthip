/**
 * Centralized contract configuration.
 * All contract IDs and network settings are read from environment variables.
 * To update: change .env.local (local) or Vercel environment variables (production).
 * Never hardcode contract IDs in components.
 */

export const config = {
  pool: {
    id: process.env.NEXT_PUBLIC_POOL_ID!,
  },
  verifier: {
    v3Id: process.env.NEXT_PUBLIC_VERIFIER_V3_ID!,
  },
  token: {
    id: process.env.NEXT_PUBLIC_TOKEN_ID!,
  },
  network: {
    name: process.env.NEXT_PUBLIC_NETWORK!,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL!,
    passphrase: process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE!,
  },
} as const;
