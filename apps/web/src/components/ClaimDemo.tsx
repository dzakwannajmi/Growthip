"use client";

import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import {
  getNetwork,
  isConnected,
  requestAccess,
  setAllowed,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { Client, networks } from "@/lib/growthipPoolClient";
import {
  GROWTHIP_NULLIFIER_HASH_HEX,
  GROWTHIP_PROOF_HEX,
  GROWTHIP_PUBLIC_INPUTS_HEX,
  GROWTHIP_RECIPIENT_HASH_HEX,
} from "@/lib/growthipProof";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

type PossibleError = string | { message?: string } | undefined;

function getErrorMessage(error: PossibleError) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || "Unknown error";
}

function shortAddress(value: string) {
  if (!value) return "";
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export default function ClaimDemo() {
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [status, setStatus] = useState(
    "Connect Freighter, check claim status, register recipient, then claim the deposited testnet XLM.",
  );
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState("");
  const [nullifierUsed, setNullifierUsed] = useState<boolean | null>(null);

  const isTestnet = useMemo(() => {
    return network.toUpperCase() === "TESTNET";
  }, [network]);

  const client = useMemo(() => {
    return new Client({
      ...networks.testnet,
      rpcUrl: RPC_URL,
      publicKey: address || undefined,
    });
  }, [address]);

  async function connectWallet() {
    setBusy(true);

    try {
      const connectedResult = await isConnected();

      if (connectedResult.error) {
        throw new Error(getErrorMessage(connectedResult.error));
      }

      if (!connectedResult.isConnected) {
        throw new Error("Freighter extension was not detected.");
      }

      await setAllowed();

      const accessResult = await requestAccess();

      if (accessResult.error) {
        throw new Error(getErrorMessage(accessResult.error));
      }

      const networkResult = await getNetwork();

      if (networkResult.error) {
        throw new Error(getErrorMessage(networkResult.error));
      }

      setAddress(accessResult.address);
      setNetwork(networkResult.network || "");
      setStatus("Wallet connected. Check claim status before claiming.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect wallet.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function signWithFreighter(txXdr: string) {
    const signed = await freighterSignTransaction(txXdr, {
      address,
      networkPassphrase: NETWORK_PASSPHRASE,
    });

    if (signed.error) {
      throw new Error(getErrorMessage(signed.error));
    }

    return {
      signedTxXdr: signed.signedTxXdr,
      signerAddress: signed.signerAddress,
    };
  }

  async function checkClaimStatus() {
    setBusy(true);

    try {
      setStatus("Checking whether this proof/nullifier has already been claimed...");

      const tx = await client.is_nullifier_used({
        nullifier_hash: Buffer.from(GROWTHIP_NULLIFIER_HASH_HEX, "hex"),
      });

      const used = Boolean(tx.result);
      setNullifierUsed(used);

      if (used) {
        setStatus(
          "This proof has already been claimed. The nullifier is used, so the same proof cannot be claimed again.",
        );
        setLastResult("claim status: already claimed");
      } else {
        setStatus(
          "This proof has not been claimed yet. You can register recipient and claim.",
        );
        setLastResult("claim status: available");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to check claim status.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function registerRecipient() {
    setBusy(true);

    try {
      if (!address) throw new Error("Connect Freighter first.");
      if (!isTestnet) throw new Error("Switch Freighter to TESTNET first.");

      setStatus("Preparing register_recipient transaction...");

      const tx = await client.register_recipient({
        recipient: address,
        recipient_hash: Buffer.from(GROWTHIP_RECIPIENT_HASH_HEX, "hex"),
      });

      setStatus("Open Freighter and approve recipient registration...");

      await tx.signAndSend({
        signTransaction: signWithFreighter,
      });

      setStatus("Recipient hash registered successfully. You can now claim.");
      setLastResult("register_recipient: success");

      await checkClaimStatus();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to register recipient.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function claimToRecipient() {
    setBusy(true);

    try {
      if (!address) throw new Error("Connect Freighter first.");
      if (!isTestnet) throw new Error("Switch Freighter to TESTNET first.");

      const statusTx = await client.is_nullifier_used({
        nullifier_hash: Buffer.from(GROWTHIP_NULLIFIER_HASH_HEX, "hex"),
      });

      if (Boolean(statusTx.result)) {
        setNullifierUsed(true);
        throw new Error(
          "This proof has already been claimed. The nullifier is used, so double-claim is blocked.",
        );
      }

      setNullifierUsed(false);
      setStatus("Preparing claim_to transaction with proof bytes and public inputs...");

      const tx = await client.claim_to({
        recipient: address,
        proof_bytes: Buffer.from(GROWTHIP_PROOF_HEX, "hex"),
        public_inputs: GROWTHIP_PUBLIC_INPUTS_HEX.map((item) =>
          Buffer.from(item, "hex"),
        ),
      });

      setStatus("Open Freighter and approve claim transaction...");

      const sent = await tx.signAndSend({
        signTransaction: signWithFreighter,
      });

      setStatus(
        `claim_to submitted. Contract result: ${String(
          sent.result,
        )}. Refresh Live Contract Reader to see totalClaims.`,
      );

      setLastResult(`claim_to result: ${String(sent.result)}`);

      await checkClaimStatus();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to claim.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="claim-demo" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-fresh-green">
            Live Claim Demo
          </p>

          <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">
            Claim the deposited tip with a Groth16 proof.
          </h2>

          <p className="mt-5 text-base leading-8 text-soft-gray/68">
            This section uses the generated proof artifact from the Growthip V3 circuit — recipientHash is now cryptographically bound inside commitment
            circuit. It registers your wallet as the recipient for the demo
            recipientHash, then calls
            <span className="font-mono text-fresh-green"> claim_to </span>
            on the deployed GrowthipPool contract.
          </p>

          <div className="mt-8 rounded-3xl border border-coral-red/20 bg-coral-red/10 p-5">
            <p className="text-sm font-bold text-coral-red">
              One proof, one claim
            </p>
            <p className="mt-2 text-sm leading-7 text-soft-gray/75">
              This proof can only be claimed once. After a successful claim, its
              nullifier is marked as used on-chain and another claim attempt is
              blocked.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-white">Claim Status</p>
              <p className="text-xs text-soft-gray/55">
                Recipient registration + claim_to
              </p>
            </div>

            <div
              className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                address && isTestnet
                  ? "bg-fresh-green/10 text-fresh-green"
                  : "bg-coral-red/10 text-coral-red"
              }`}
            >
              {address && isTestnet ? "READY" : "NOT READY"}
            </div>
          </div>

          <div className="grid gap-3">
            <ClaimInfo
              label="Connected Wallet"
              value={address ? shortAddress(address) : "not connected"}
            />
            <ClaimInfo label="Network" value={network || "unknown"} />
            <ClaimInfo
              label="Nullifier Used"
              value={
                nullifierUsed === null
                  ? "not checked"
                  : nullifierUsed
                    ? "yes — already claimed"
                    : "no — claim available"
              }
            />
            <ClaimInfo
              label="Recipient Hash"
              value={GROWTHIP_RECIPIENT_HASH_HEX}
            />
            <ClaimInfo label="Last Result" value={lastResult || "none"} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button
              onClick={connectWallet}
              disabled={busy}
              className="rounded-2xl bg-neon-violet px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Connect
            </button>

            <button
              onClick={checkClaimStatus}
              disabled={busy}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Check Claim Status
            </button>

            <button
              onClick={registerRecipient}
              disabled={busy || !address}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Register Recipient
            </button>

            <button
              onClick={claimToRecipient}
              disabled={busy || !address || nullifierUsed === true}
              className="rounded-2xl bg-fresh-green px-4 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Claim 10 XLM
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-midnight-blue/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
              Status
            </p>
            <p className="mt-2 text-sm leading-7 text-soft-gray/80">{status}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClaimInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-gray/40">
        {label}
      </p>
      <p className="break-all font-mono text-sm text-soft-gray/85">{value}</p>
    </div>
  );
}
