"use client";

import { useMemo, useState } from "react";
import { Buffer } from "buffer";
import {
  addToken,
  getNetwork,
  isConnected,
  requestAccess,
  setAllowed,
  signTransaction as freighterSignTransaction,
} from "@stellar/freighter-api";
import { Client, networks } from "growthip-pool-client";

const TOKEN_ID =
  "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

const POOL_ID =
  "CDFAGPSKKJCWJEOGHFYBEWSMSVGQSNXBXPQA45MGHL2ZIQDBQTTHPEFZ";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

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

function randomHex(bytes: number) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);

  return Array.from(array)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

export default function FreighterPayDemo() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState("");
  const [network, setNetwork] = useState("");
  const [status, setStatus] = useState(
    "Connect Freighter to prepare a Growthip private tip demo.",
  );
  const [commitment, setCommitment] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isTestnet = useMemo(() => {
    return network.toUpperCase() === "TESTNET";
  }, [network]);

  async function connectWallet() {
    setBusy(true);

    try {
      const connectedResult = await isConnected();

      if (connectedResult.error) {
        throw new Error(getErrorMessage(connectedResult.error));
      }

      if (!connectedResult.isConnected) {
        setInstalled(false);
        setStatus("Install Freighter first, then refresh this page.");
        return;
      }

      setInstalled(true);

      await setAllowed();

      const accessResult = await requestAccess();

      if (accessResult.error) {
        throw new Error(getErrorMessage(accessResult.error));
      }

      setAddress(accessResult.address);

      const networkResult = await getNetwork();

      if (networkResult.error) {
        throw new Error(getErrorMessage(networkResult.error));
      }

      setNetwork(networkResult.network || "");
      setStatus("Freighter connected. You can now prepare or submit a Growthip tip.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to connect wallet.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function addXlmToken() {
    setBusy(true);

    try {
      const result = await addToken({
        contractId: TOKEN_ID,
        networkPassphrase: NETWORK_PASSPHRASE,
      });

      if (result.error) {
        throw new Error(getErrorMessage(result.error));
      }

      setStatus("Native XLM token contract added or confirmed in Freighter.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to add token.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  function prepareDemoTip() {
    if (!address) {
      setStatus("Connect Freighter first before preparing a demo tip.");
      return;
    }

    if (!isTestnet) {
      setStatus("Switch Freighter to TESTNET first.");
      return;
    }

    const secret = randomHex(32);
    const nullifier = randomHex(32);
    const demoCommitment = randomHex(32);

    setCommitment(demoCommitment);
    setPrivateNote(
      `growthip-testnet-note:${demoCommitment}:${secret}:${nullifier}`,
    );

    setStatus(
      "Demo private tip note prepared. You can now submit deposit_paid on-chain.",
    );
  }

  async function depositPaid() {
    setBusy(true);

    try {
      if (!address) {
        throw new Error("Connect Freighter first.");
      }

      if (!isTestnet) {
        throw new Error("Switch Freighter to TESTNET first.");
      }

      const demoCommitment = commitment || randomHex(32);

      if (!commitment) {
        const secret = randomHex(32);
        const nullifier = randomHex(32);

        setCommitment(demoCommitment);
        setPrivateNote(
          `growthip-testnet-note:${demoCommitment}:${secret}:${nullifier}`,
        );
      }

      setStatus("Preparing deposit_paid transaction...");

      const client = new Client({
        ...networks.testnet,
        rpcUrl: RPC_URL,
        publicKey: address,
      });

      const tx = await client.deposit_paid({
        depositor: address,
        commitment: Buffer.from(demoCommitment, "hex"),
      });

      setStatus("Open Freighter and approve the deposit transaction...");

      const sent = await tx.signAndSend({
        signTransaction: async (txXdr: string) => {
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
        },
      });

      setStatus(
        `Deposit submitted successfully. Result: ${String(sent.result)}. Refresh Live Contract Reader to see totalDeposits increase.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to submit deposit.";
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="pay-demo" className="mx-auto max-w-7xl px-6 py-20 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-fresh-green">
            Freighter Pay Demo
          </p>

          <h2 className="text-3xl font-black tracking-tight text-white md:text-5xl">
            Connect wallet and send a private Growthip tip.
          </h2>

          <p className="mt-5 text-base leading-8 text-soft-gray/68">
            This panel connects Freighter, checks the user network, confirms the
            native XLM token contract, prepares a private tip note, and submits a
            real
            <span className="font-mono text-fresh-green"> deposit_paid </span>
            transaction to the deployed GrowthipPool contract on Stellar Testnet.
          </p>

          <div className="mt-8 rounded-3xl border border-coral-red/20 bg-coral-red/10 p-5">
            <p className="text-sm font-bold text-coral-red">Testnet only</p>
            <p className="mt-2 text-sm leading-7 text-soft-gray/75">
              This uses testnet XLM through the native Stellar Asset Contract.
              Do not use real funds. If the transaction fails, make sure your
              Freighter account is on TESTNET and funded with testnet XLM.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-rich-black/70 p-5 shadow-2xl backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-bold text-white">Wallet Status</p>
              <p className="text-xs text-soft-gray/55">
                Freighter + Stellar Testnet
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
            <PayInfo
              label="Freighter Installed"
              value={
                installed === null ? "not checked" : installed ? "yes" : "no"
              }
            />
            <PayInfo
              label="Connected Wallet"
              value={address ? shortAddress(address) : "not connected"}
            />
            <PayInfo label="Network" value={network || "unknown"} />
            <PayInfo label="Tip Amount" value="10 XLM testnet demo" />
            <PayInfo label="Growthip Pool" value={shortAddress(POOL_ID)} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <button
              onClick={connectWallet}
              disabled={busy}
              className="rounded-2xl bg-neon-violet px-4 py-3 text-sm font-bold text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Loading..." : "Connect Freighter"}
            </button>

            <button
              onClick={addXlmToken}
              disabled={busy || !address}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add XLM Token
            </button>

            <button
              onClick={prepareDemoTip}
              disabled={busy || !address}
              className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prepare Private Note
            </button>

            <button
              onClick={depositPaid}
              disabled={busy || !address}
              className="rounded-2xl bg-fresh-green px-4 py-3 text-sm font-black text-midnight-blue transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Deposit 10 XLM
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-white/10 bg-midnight-blue/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-soft-gray/45">
              Status
            </p>
            <p className="mt-2 text-sm leading-7 text-soft-gray/80">{status}</p>
          </div>

          {commitment && (
            <div className="mt-5 space-y-3">
              <PayInfo label="Demo Commitment" value={commitment} />
              <PayInfo label="Private Note" value={privateNote} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function PayInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-soft-gray/40">
        {label}
      </p>
      <p className="break-all font-mono text-sm text-soft-gray/85">{value}</p>
    </div>
  );
}
