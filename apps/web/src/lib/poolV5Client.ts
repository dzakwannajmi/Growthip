/**
 * poolV5Client.ts
 *
 * Thin, reusable helper for building a pool-v5 client (Pool XLM V5 or
 * Pool USDC V5 -- same wasm, two separate deployed instances, each with
 * its own immutable `domain`). Mirrors registryClient.ts's pattern
 * exactly (dynamic import to keep the generated client out of the SSR
 * bundle, wallet-signing via @/lib/wallet), generalized to take a
 * contract ID parameter since -- unlike the single, shared creator
 * registry -- there are two independent pool-v5 instances.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { config } from "@/lib/config";

const RPC_URL = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

export type PoolV5Token = "xlm" | "usdc";

function poolV5ContractId(token: PoolV5Token): string {
  const id = token === "xlm" ? config.poolV5.xlm : config.poolV5.usdc;
  if (!id) throw new Error(`Pool V5 (${token}) contract ID is not configured.`);
  return id;
}

type PoolV5Module = {
  Client: typeof import("@/lib/poolV5Bindings").Client;
  networks: typeof import("@/lib/poolV5Bindings").networks;
};

/**
 * React hook that lazily loads the generated pool-v5 client module and
 * exposes a `buildPoolV5Client(token, publicKey)` factory.
 */
export function usePoolV5Client() {
  const [mod, setMod] = useState<PoolV5Module | null>(null);

  useEffect(() => {
    import("@/lib/poolV5Bindings").then((m) =>
      setMod({ Client: m.Client, networks: m.networks }),
    );
  }, []);

  const buildPoolV5Client = useCallback(
    (token: PoolV5Token, publicKey: string) => {
      if (!mod) throw new Error("Pool V5 client not ready yet.");
      const { Client, networks } = mod;
      return new Client({
        ...networks.testnet,
        contractId: poolV5ContractId(token),
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const { signTransaction: walletSign } = await import("@/lib/wallet");
          const signed = await walletSign(xdr, {
            address: publicKey,
            networkPassphrase: NETWORK_PASSPHRASE,
          });
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      });
    },
    [mod],
  );

  return { isReady: mod !== null, buildPoolV5Client };
}
