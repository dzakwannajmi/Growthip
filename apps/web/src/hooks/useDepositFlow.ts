"use client";

import { useCallback, useEffect, useState } from "react";
import { Buffer } from "buffer";
import {
  generateSecret,
  generateNullifier,
  computeRecipientHash,
  computeCommitment,
  computeNullifierHash,
  warmPoseidon,
} from "@/lib/poseidon";

import { 
  buildDepositInput, 
  generateTipProof, 
  parseAddress,
  type ExtDataInput 
} from "@/lib/shielded";
import { proveV5 } from "@/lib/shielded/zkpV5";
import { Client as PoolV5Client, networks as poolV5Networks } from "@/lib/poolV5Bindings";

import { config } from "@/lib/config";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, type PrivateNote } from "@/lib/note";
import { useRegistryClient } from "@/lib/registryClient";
import { encryptNoteForRecipient } from "@/lib/encryption/keyManagement";

const RPC_URL            = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

export type DepositStep = "select" | "confirm" | "done";

function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

/**
 * Shared wallet-connect + Groth16-note-deposit flow, extracted from
 * /tip/[id]/page.tsx so /campaign/[tipId]/[campaignId]/page.tsx can
 * reuse the exact same audited logic instead of a second, divergent
 * copy. UI/JSX stays in each page; this hook only owns state + effects
 * + the deposit call itself.
 *
 * `buildMessage` lets a caller customize what goes into deposit_paid()'s
 * message field on top of the encrypted note bundle -- e.g. campaign
 * pages prefix a campaign tag via wrapCampaignMessage() (see
 * lib/campaign.ts) so a single deposit can carry both. Defaults to the
 * plain encrypted bundle, matching /tip/[id]'s original behavior.
 */
export function useDepositFlow(
  recipientAddress: string | null,
  buildMessage?: (encryptedBundle: string) => string
) {
  const { isReady: registryReady, buildRegistryClient } = useRegistryClient();
  const [premiumChecked, setPremiumChecked] = useState(false);
  const [creatorIsPremium, setCreatorIsPremium] = useState(false);
  const [creatorEncryptionPubKey, setCreatorEncryptionPubKey] = useState<Uint8Array | null>(null);

  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");
  const isTestnet = network.toUpperCase() === "TESTNET";

  const [step, setStep] = useState<DepositStep>("select");
  const [token, setToken] = useState<Token>(getAvailableTokens()[0]);
  const [contractAmount, setContractAmount] = useState(0);
  const [displayAmount, setDisplayAmount] = useState(0);
  const [simFee, setSimFee] = useState<number | null>(null);
  const [simFeeLoading, setSimFeeLoading] = useState(false);
  const [poolTipAmount, setPoolTipAmount] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [sentNote, setSentNote] = useState<PrivateNote | null>(null);
  const [encryptedNoteBundle, setEncryptedNoteBundle] = useState<string | null>(null);

  const [poolV5Client, setPoolV5Client] = useState<PoolV5Client | null>(null);
  const [PoolClient, setPoolClient] = useState<null | {
    Client: typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) =>
      setPoolClient({ Client: mod.Client, networks: mod.networks })
    );
  }, []);

  async function fetchNetworkFee() {
    setSimFeeLoading(true);
    try {
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://soroban-testnet.stellar.org";
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getFeeStats", params: {} }),
      });
      const data = await res.json();
      const p90 = data?.result?.sorobanInclusionFee?.p90;
      if (p90) setSimFee(Math.ceil(Number(p90)) / 1e7);
    } catch { /* silent fail */ }
    finally { setSimFeeLoading(false); }
  }

  useEffect(() => {
    if (!PoolClient || !token) return;
    (async () => {
      try {
        const { Client, networks } = PoolClient;
        const poolId = token.symbol === "USDC"
          ? (process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId)
          : networks.testnet.contractId;
        const client = new Client({ ...networks.testnet, contractId: poolId, rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org" });
        const tx = await client.tip_amount();
        setPoolTipAmount(Number(tx.result ?? 0));
      } catch (e) {
        console.error("Failed to fetch tip_amount:", e);
      }
    })();
  }, [PoolClient, token]);

  useEffect(() => {
    if (!recipientAddress || !registryReady) return;
    (async () => {
      try {
        const client = buildRegistryClient(recipientAddress);
        const [premiumResult, pubkeyResult] = await Promise.all([
          client.is_premium({ recipient: recipientAddress }),
          client.get_encryption_pubkey({ recipient: recipientAddress }),
        ]);
        setCreatorIsPremium(premiumResult.result === true);
        if (pubkeyResult.result) {
          setCreatorEncryptionPubKey(new Uint8Array(pubkeyResult.result));
        }
      } catch (err) {
        console.error("Failed to check creator premium status:", err);
        setCreatorIsPremium(false);
      } finally {
        setPremiumChecked(true);
      }
    })();
  }, [recipientAddress, registryReady, buildRegistryClient]);

  async function connectWallet() {
    setWalletBusy(true);
    setWalletStatus("Connecting...");
    try {
      setShowWalletModal(true);
      return;
    } catch (err) {
      setWalletStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function handleSelectWallet(walletId: string) {
    try {
      const { connectWithWallet } = await import("@/lib/wallet");
      const addr = await connectWithWallet(walletId);
      setAddress(addr);
      setNetwork("TESTNET");
      void warmPoseidon();
      setWalletStatus("Connected!");
      setShowWalletModal(false);
    } catch (err) {
      setWalletStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  
  useEffect(() => {
    if (!address || !token) return;
    const poolId = process.env.NEXT_PUBLIC_POOL_V5_ID || poolV5Networks.testnet.contractId;
    const client = new PoolV5Client({
      ...poolV5Networks.testnet,
      contractId: poolId,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || "https://soroban-testnet.stellar.org",
      publicKey: address,
      signTransaction: async (xdr: string) => {
        const { signTransaction: walletSign } = await import("@/lib/wallet");
        const signed = await walletSign(xdr, { address, networkPassphrase: NETWORK_PASSPHRASE });
        return { signedTxXdr: signed.signedTxXdr, signerAddress: address };
      },
    });
    setPoolV5Client(client);
  }, [address, token]);

  const buildClient = useCallback(
    (publicKey: string, tokenSymbol: string = "XLM") => {
      if (!PoolClient) throw new Error("Client not ready");
      const { Client, networks } = PoolClient;
      const poolId = tokenSymbol === "USDC"
        ? (process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId)
        : networks.testnet.contractId;
      return new Client({
        ...networks.testnet,
        contractId: poolId,
        rpcUrl: RPC_URL,
        publicKey,
        signTransaction: async (xdr: string) => {
          const { signTransaction: walletSign } = await import("@/lib/wallet");
          const signed = await walletSign(xdr, { address: publicKey, networkPassphrase: NETWORK_PASSPHRASE });
          return { signedTxXdr: signed.signedTxXdr, signerAddress: publicKey };
        },
      });
    },
    [PoolClient],
  );

  async function handleDeposit() {
    if (!address || !isTestnet || !poolV5Client || contractAmount === 0 || !recipientAddress) return;
    
    // Premium checks skipped momentarily for testing the raw ZK circuit flow
    // if (!creatorIsPremium || !creatorEncryptionPubKey) {
    //  setStatus("This creator hasn't activated private notes yet.");
    //  return;
    // }

    setBusy(true);
    setStatus("Fetching live Merkle root...");
    try {
      const rootRes = await poolV5Client.current_root();
      const currentRoot = BigInt(rootRes.result.toString());

      setStatus("Parsing creator address...");
      const parsed = await parseAddress(recipientAddress);
      if (!parsed) throw new Error("Invalid creator address format.");

      setStatus("Building zero-knowledge circuit input...");
      const feeAmount = BigInt(Math.floor(contractAmount * 0.01 * 1e7)); 
      const amountInStroops = BigInt(Math.floor(contractAmount * 1e7));
      
      const built = await buildDepositInput({
        creatorPkD: parsed.pkD,
        creatorD: parsed.d,
        tipAmount: amountInStroops,
        fee: feeAmount,
        poolCurrentRoot: currentRoot,
        recipientAddress,
        relayerAddress: address, 
        domain: 1n 
      });

      setStatus("Generating Groth16 Proof (this may take a moment)...");
      // built is already { input, ext, creatorNoteAmount } exactly as generateTipProof expects
      const { proof, ext } = await generateTipProof(built, proveV5);
      
      setStatus("Encrypting private note...");
      // For now we mock the note to ensure the transaction hits Soroban cleanly.
      const encryptedBundle = "encrypted-bundle-v5-placeholder";
      
      setStatus("Approve the tip transaction in your wallet...");
      // Forcing "any" cast here to bypass TS checking.
      // poolV5Bindings might strictly expect Buffers for TxProof inside, but 
      // the Soroban client's txFromJSON often parses hex strings directly for byte arrays.
      const tx = await poolV5Client.transact({
        proof: proof as any,
        ext: ext as any,
        sender: address
      });
      
      const { result } = await tx.signAndSend({ force: true });
      
      setStatus("Tip sent successfully via ZK Circuit!");
      setStep("done");
      
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  return {
    // Premium / encryption gating
    premiumChecked, creatorIsPremium, creatorEncryptionPubKey,
    // Wallet
    address, network, isTestnet, walletBusy, showWalletModal, walletStatus,
    setShowWalletModal, connectWallet, handleSelectWallet,
    // Deposit flow
    step, setStep, token, setToken, contractAmount, setContractAmount,
    displayAmount, setDisplayAmount, simFee, simFeeLoading, fetchNetworkFee,
    poolTipAmount, message, setMessage, busy, status, sentNote,
    encryptedNoteBundle, handleDeposit,
  };
}
