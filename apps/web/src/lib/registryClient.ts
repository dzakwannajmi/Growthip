/**
 * registryClient.ts
 *
 * Thin, reusable helper for building a growthip-creator-registry client.
 * Follows the same dynamic-import pattern already used for
 * growthipPoolClient.ts elsewhere in the dashboard (avoids pulling the
 * generated contract client into the SSR bundle).
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import {
} from "@stellar/freighter-api";
import { config } from "@/lib/config";

const RPC_URL = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;
const REGISTRY_CONTRACT_ID = process.env.NEXT_PUBLIC_CREATOR_REGISTRY_ID || "";

type RegistryModule = {
  Client: typeof import("@/lib/growthipCreatorRegistryClient").Client;
  networks: typeof import("@/lib/growthipCreatorRegistryClient").networks;
};

/**
 * React hook that lazily loads the generated registry client module and
 * exposes a `buildRegistryClient(publicKey)` factory, mirroring the
 * dashboard's existing `buildClient` pattern for growthip-pool.
 */
export function useRegistryClient() {
  const [mod, setMod] = useState<RegistryModule | null>(null);

  useEffect(() => {
    import("@/lib/growthipCreatorRegistryClient").then((m) =>
      setMod({ Client: m.Client, networks: m.networks }),
    );
  }, []);

  const buildRegistryClient = useCallback(
    (publicKey: string) => {
      if (!mod) throw new Error("Registry client not ready yet.");
      const { Client, networks } = mod;
      return new Client({
        ...networks.testnet,
        contractId: REGISTRY_CONTRACT_ID || networks.testnet.contractId,
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

  return { isReady: mod !== null, buildRegistryClient };
}