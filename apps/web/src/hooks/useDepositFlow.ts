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
    if (!address || !isTestnet || !PoolClient || contractAmount === 0 || !recipientAddress) return;
    if (!creatorIsPremium || !creatorEncryptionPubKey) {
      setStatus("This creator hasn't activated private notes yet.");
      return;
    }
    setBusy(true);
    setStatus("Generating secret and nullifier...");
    try {
      const secret = generateSecret();
      const nullifier = generateNullifier();
      setStatus("Computing recipient hash...");
      const recipientHash = await computeRecipientHash(recipientAddress);
      const commitment = await computeCommitment(secret, nullifier, recipientHash);
      const nullifierHash = await computeNullifierHash(nullifier);
      const commitmentHex = decimalToHex32(commitment);
      const client = buildClient(address, token.symbol);

      setStatus("Encrypting note for the creator...");
      const partialNote: PrivateNote = {
        version: "growthip-v3", secret, nullifier, recipientHash,
        commitment: commitmentHex, nullifierHash: decimalToHex32(nullifierHash),
        root: "0".padStart(64, "0"), token: token.symbol as TokenSymbol,
        amount: String(contractAmount), timestamp: Date.now(), depositIndex: -1, claimed: false,
        recipientAddress: recipientAddress ?? undefined,
        poolId: token.symbol === "USDC"
          ? process.env.NEXT_PUBLIC_POOL_USDC_ID
          : process.env.NEXT_PUBLIC_POOL_ID,
      };
      const noteBytes = new TextEncoder().encode(JSON.stringify(partialNote));
      const encryptedBundle = await encryptNoteForRecipient(creatorEncryptionPubKey, noteBytes);

      const finalMessage = buildMessage
        ? buildMessage(encryptedBundle)
        : (encryptedBundle || (message.trim() ? message.trim() : undefined));

      setStatus("Approve the deposit transaction in your wallet...");
      const tx = await client.deposit_paid({
        depositor: address,
        commitment: Buffer.from(commitmentHex, "hex"),
        amount: BigInt(contractAmount),
        message: finalMessage,
      });
      const { result } = await tx.signAndSend({ force: true });
      const depositIndex = Number(result ?? 0);

      const newNote: PrivateNote = { ...partialNote, depositIndex };
      if (recipientAddress) saveNote(recipientAddress, newNote);
      setSentNote(newNote);
      setEncryptedNoteBundle(encryptedBundle);
      setStatus("Tip sent!");
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
