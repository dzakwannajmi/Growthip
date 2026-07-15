"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePrices, useWalletBalances } from "@/lib/useMarket";
import { useCurrency, formatMoney } from "@/lib/currency";
import { Buffer } from "buffer";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";
import {
  isConnected,
  requestAccess,
  setAllowed,
  getNetwork,
} from "@stellar/freighter-api";
import {
  computeRecipientHash,
  warmPoseidon,
} from "@/lib/poseidon";
import { hexToBuffer, generateProof, toClaimArgs, type ProofProgress } from "@/lib/zkp";
import {
  getMerklePath,
  hexToDecimal,
  bytesToDecimal,
  MAX_LEAVES,
  type MerklePath,
} from "@/lib/merkle";
import { config } from "@/lib/config";
import WalletModal from "@/components/WalletModal";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";
import { saveNote, getPendingNotes, getClaimedNotes, markNoteAsClaimed, migrateLegacyNotes, formatRelativeTime, type PrivateNote } from "@/lib/note";
import { proveV5 } from "@/lib/shielded/zkpV5";
import { buildWithdrawInput } from "@/lib/shielded/tipFlow";
import { Client as PoolV5Client } from "@/lib/poolV5Bindings";

import { getStoredGrAddress } from "@/lib/shielded/grIdentity";
import Link from "next/link";
import Modal from "@/components/Modal";
import { getProfile, avatarUrlFor } from "@/lib/profile";
import TokenSelector from "@/components/TokenSelector";
import AmountSelector from "@/components/AmountSelector";

const RPC_URL = config.network.rpcUrl;
const NETWORK_PASSPHRASE = config.network.passphrase;

// ── Types ──────────────────────────────────────────────────────────────────
interface TokenPrice { percent: string; isUp: boolean }

// ── Helpers ────────────────────────────────────────────────────────────────
function decimalToHex32(decimal: string): string {
  return BigInt(decimal).toString(16).padStart(64, "0");
}

function commitmentToDecimal(raw: Buffer | Uint8Array | string): string {
  if (typeof raw === "string") return hexToDecimal(raw);
  return bytesToDecimal(raw instanceof Uint8Array ? raw : new Uint8Array(raw));
}

function formatAmount(note: PrivateNote): string {
  const tokens = getAvailableTokens();
  const token = tokens.find((t) => t.symbol === note.token);
  if (!token) return `${note.amount} ${note.token}`;
  const human = Number(note.amount) / Math.pow(10, token.decimals);
  return `${human % 1 === 0 ? human.toFixed(0) : human.toFixed(1)} ${token.symbol}`;
}

function encodeNote(note: PrivateNote): string {
  return btoa(JSON.stringify(note));
}

// ── Tooltip component ─────────────────────────────────────────────────────────
function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <Icon
        icon="ph:info"
        className="text-[#A3A3A3] dark:text-[#6A6A6A]"
        style={{ fontSize: "14px", cursor: "help" }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      />
      {show && (
        <div
          className="bg-white dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5] border border-[#E5E5E5] dark:border-[#2A2A2A]"
          style={{
            position: "absolute", bottom: "calc(100% + 12px)", left: "0",
            fontSize: "12px", fontWeight: 500, padding: "10px 14px", borderRadius: "12px",
            whiteSpace: "normal", maxWidth: "240px", width: "240px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.12)", zIndex: 100, lineHeight: 1.6,
            pointerEvents: "none",
          }}
        >
          {text}
          {/* Speech bubble pointer - bottom left */}
          <div
            className="border-t-[#E5E5E5] dark:border-t-[#2A2A2A]"
            style={{
              position: "absolute", top: "100%", left: "10px",
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTopWidth: "8px", borderTopStyle: "solid",
            }}
          />
          <div
            className="border-t-white dark:border-t-[#1E1E1E]"
            style={{
              position: "absolute", top: "calc(100% - 1px)", left: "10px",
              width: 0, height: 0,
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTopWidth: "8px", borderTopStyle: "solid",
            }}
          />
        </div>
      )}
    </div>

  );
}

// ── Live price simulation ──────────────────────────────────────────────────
function useLivePrices() {
  const [xlm, setXlm] = useState<TokenPrice>({ percent: "+2.45%", isUp: true });
  const [usdc, setUsdc] = useState<TokenPrice>({ percent: "+0.01%", isUp: true });
  const [total, setTotal] = useState({ percent: "+0.00%", value: "(+$0.00)", isUp: true });

  useEffect(() => {
    function tick() {
      const move = (vol: number) => {
        const isUp = Math.random() > 0.45;
        return { percent: `${isUp ? "+" : "-"}${(Math.random() * vol).toFixed(2)}%`, isUp };
      };
      const nt = move(3.0);
      const dc = (1000 * Math.abs(parseFloat(nt.percent)) / 100).toFixed(2);
      setXlm(move(5.0));
      setUsdc(move(0.05));
      setTotal({ percent: nt.percent, value: `(${nt.isUp ? "+" : "-"}$${dc})`, isUp: nt.isUp });
    }
    const t = setTimeout(tick, 1000);
    const i = setInterval(tick, 4500);
    return () => { clearTimeout(t); clearInterval(i); };
  }, []);

  return { xlm, usdc, total };
}

// ── Card wrapper ───────────────────────────────────────────────────────────
function Card({ children, style, className }: { children: React.ReactNode; style?: React.CSSProperties; className?: string }) {
  return (
    <div
      className={["rounded-2xl border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#151515] p-6", className].filter(Boolean).join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold text-[#A3A3A3] dark:text-[#6A6A6A] uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  // Wallet state
  const [address, setAddress] = useState<string>("");
  const [displayName, setDisplayName] = useState("");

  // Local profile display name, kept in sync with whatever was set on
  // the Settings page (per-address localStorage, not on-chain).
  useEffect(() => {
    if (!address) { setDisplayName(""); return; }
    setDisplayName(getProfile(address).displayName);
  }, [address]);
  const [network, setNetwork] = useState<string>("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletStatus, setWalletStatus] = useState("");

  const isTestnet = network.toUpperCase() === "TESTNET";
  const isMainnet = network.toUpperCase() === "PUBLIC" || network.toUpperCase() === "MAINNET";

  // Load wallet from localStorage after mount (avoids SSR hydration mismatch)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const load = async () => {
      const addr = localStorage.getItem("growthip:wallet") ?? "";
      setAddress(addr);
      setRecipient(addr);
      // Auto-register recipient hash in pool if not yet registered
      // Only on first load (not on polling interval)
      const isFirstLoad = !localStorage.getItem("growthip:registered:" + addr);
      if (addr && isFirstLoad) {
        // Set flag BEFORE async operations to prevent re-entry from polling
        localStorage.setItem("growthip:registered:" + addr, "1");
        try {
          const { Client } = await import("@/lib/growthipPoolClient");
          const { computeRecipientHash } = await import("@/lib/poseidon");
          const { signTransaction } = await import("@/lib/wallet");
          const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "";
          const passphrase = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? "";
          const recipientHash = await computeRecipientHash(addr);
          const recipientHashBuf = Buffer.from(decimalToHex32(recipientHash), "hex");

          // Register in all pools
          const poolIds = [
            process.env.NEXT_PUBLIC_POOL_ID ?? "",
            process.env.NEXT_PUBLIC_POOL_USDC_ID ?? "",
          ].filter(Boolean);

          for (const poolId of poolIds) {
            try {
              const autoClient = new Client({
                contractId: poolId,
                rpcUrl,
                networkPassphrase: passphrase,
                publicKey: addr,
                signTransaction: async (xdr: string) => {
                  const signed = await signTransaction(xdr, { address: addr, networkPassphrase: passphrase });
                  return { signedTxXdr: signed.signedTxXdr, signerAddress: addr };
                },
              });
              const existing = await autoClient.get_recipient_hash({ recipient: addr });
              if (existing.result == null) {
                const regTx = await autoClient.register_recipient({ recipient: addr, recipient_hash: recipientHashBuf });
                await regTx.signAndSend({ force: true });
              }
            } catch {
              // Silent fail per pool
            }
          }
        } catch {
          // Silent fail — non-critical, user can still use app
        }
      }
      // Detect active network from wallet extension
      try {
        const { getNetwork } = await import("@stellar/freighter-api");
        const net = await getNetwork();
        // Check networkPassphrase — wallet extensions keep net.network as "TESTNET"
        // but changes networkPassphrase when switching networks
        const passphrase = (net.networkPassphrase ?? "").toLowerCase();
        const isMainnetPassphrase = passphrase.includes("public global stellar");
        const resolvedNet = isMainnetPassphrase ? "PUBLIC" : "TESTNET";
        setNetwork(resolvedNet);
        localStorage.setItem("growthip:network", resolvedNet);
      } catch {
        const net = localStorage.getItem("growthip:network") || (addr ? "TESTNET" : "");
        setNetwork(net);
      }
    };
    load();
    // Poll every 2s to detect network changes in wallet extension
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, []);

  // UI state
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"send" | "withdraw">("send");

  // Send tip state
  const [sentNote, setSentNote] = useState<PrivateNote | null>(null);
  const [showLinkQR, setShowLinkQR] = useState(false);
  const [showDashShare, setShowDashShare] = useState(false);
  const [dashShareMsg, setDashShareMsg] = useState("Support me privately on Growthip — zero-knowledge tips, nobody knows who paid 🌱");
  const MAX_POOL_LEAVES = 8;
  const [linkCopied, setLinkCopied] = useState(false);

  // Withdraw (claim) state
  const [noteInput, setNoteInput] = useState("");
  const [recipient, setRecipient] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimProgress, setClaimProgress] = useState<ProofProgress | null>(null);
  const [claimStatus, setClaimStatus] = useState("");
  const [claimStage, setClaimStage] = useState<"idle" | "loading" | "proving" | "submitting" | "done" | "error">("idle");
  const [claimTxHash, setClaimTxHash] = useState("");
  const [claimError, setClaimError] = useState("");
  const [needsUnlock, setNeedsUnlock] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);

  // Notes state
  const [pending, setPending] = useState<PrivateNote[]>([]);
  const [claimed, setClaimed] = useState<PrivateNote[]>([]);

  const { xlm, usdc, total } = useLivePrices();
  const { prices } = usePrices();
  const [currency] = useCurrency();
  const rateFor = (tokenSymbol: string): number => {
    if (tokenSymbol === "XLM")  return currency === "IDR" ? prices.xlm.idr  : prices.xlm.usd;
    if (tokenSymbol === "USDC") return currency === "IDR" ? prices.usdc.idr : prices.usdc.usd;
    return 0;
  };
  const { balances, refetch: refetchBalances } = useWalletBalances(address);

  // Pool client
  const [PoolClient, setPoolClient] = useState<null | {
    Client: typeof import("@/lib/growthipPoolClient").Client;
    networks: typeof import("@/lib/growthipPoolClient").networks;
  }>(null);

  useEffect(() => {
    import("@/lib/growthipPoolClient").then((mod) => {
      setPoolClient({ Client: mod.Client, networks: mod.networks });
    });
  }, []);

  // Load notes from localStorage, namespaced per connected address.
  useEffect(() => {
    if (!address) { setPending([]); setClaimed([]); return; }
    setPending(getPendingNotes(address));
    setClaimed(getClaimedNotes(address));
  }, [sentNote, claimTxHash, address]);

  // ── Build client ────────────────────────────────────────────────────────
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

  // ── Connect wallet ──────────────────────────────────────────────────────
  async function connectWallet() {
    setWalletBusy(true);
    setWalletStatus("Connecting...");
    try {
      // Wallet connection is handled via WalletModal component
      // which calls handleWalletSelect(walletId) directly
      setShowWalletModal(true);
    } catch (err) {
      setWalletStatus(err instanceof Error ? err.message : "Failed.");
    } finally {
      setWalletBusy(false);
    }
  }

  async function autoRegisterRecipient(walletAddress: string) {
    if (!PoolClient) return;
    const recipientHash = await computeRecipientHash(walletAddress);
    const recipientHashBuf = Buffer.from(decimalToHex32(recipientHash), "hex");

    // One-time migration: move any pre-namespacing notes this address
    // can claim (matched by recipientHash) into this address's own
    // localStorage bucket. Safe to call on every connect -- it's
    // idempotent and a no-op once already migrated.
    const recipientHashDecimal = recipientHash.toString();
    migrateLegacyNotes(walletAddress, recipientHashDecimal);

    for (const tokenSymbol of ["XLM", "USDC"]) {
      try {
        const client = buildClient(walletAddress, tokenSymbol);
        const existing = await client.get_recipient_hash({ recipient: walletAddress });
        if (existing.result == null) {
          const tx = await client.register_recipient({
            recipient: walletAddress,
            recipient_hash: recipientHashBuf,
          });
          await tx.signAndSend({ force: true });
        }
      } catch (err) {
        // Silent fail per-token — e.g. a token's pool isn't configured
        // yet, or the user rejects one of the signing prompts. Doesn't
        // block wallet connect; the user can still use whichever
        // token's pool succeeded.
      }
    }
  }

  // ── Withdraw (Claim) ────────────────────────────────────────────────────
  async function handleClaim() {
    if (!address || !isTestnet || !PoolClient) return;
    setClaimError("");
    setClaimTxHash("");
    setClaimStage("loading");
    setClaimBusy(true);

    try {
      // Parse note -- supports two formats:
      //   1. Encrypted bundle (base64url, from a supporter using /tip/[id])
      //      -- must be decrypted with the unlocked encryption session
      //      before it can be parsed as JSON.
      //   2. Legacy plaintext note (raw JSON or base64 JSON) -- kept for
      //      backward compatibility with notes sent before encryption
      //      was mandatory.
      const raw = noteInput.trim();
      let note: any = {} as any;

      if (!raw.startsWith("{")) {
        // Try treating it as an encrypted bundle first.
        const { getGrSeed } = await import("@/lib/shielded/grIdentity");
        const { deriveShieldedKeys } = await import("@/lib/shielded/keys");
        const { tryDecryptNote } = await import("@/lib/shielded/noteEncryption");
        try {
          const { getGrSeed } = await import("@/lib/shielded/grIdentity");
            const { deriveShieldedKeys } = await import("@/lib/shielded/keys");
            const seed = getGrSeed();
            const keys = await deriveShieldedKeys(seed);

const { diversifiedKey } = await import("@/lib/shielded/keys");

const currentPkD = await diversifiedKey(keys.ivk, keys.d);


const blob = Buffer.from(raw, "base64");


const decrypted = await tryDecryptNote(keys.ivk, blob);
            if (!decrypted) throw new Error("Failed to decrypt V5 note. Please verify your IVK key.");
            note = decrypted;

            // 4. Siapkan Dummy Merkle Path (Karena backend belum punya Merkle Indexer)
            

            // 5. Susun Input Sirkuit V5
            
            // Parser kebal peluru untuk menangkap Buffer/Hex dan menjadikannya BigInt murni
            
            // [ORIGINAL] 4. Build the Merkle path with LIVE data from Soroban
            setClaimStatus("Loading pool commitments...");

            // Bug #10 fix: V5's encrypted note payload (tryDecryptNote) is
            // FIXED at { amount, d, blinding } only -- it never carries a
            // `token` field (see PT_LEN = 75 = amount(32)+d(11)+blinding(32)
            // in noteEncryption.ts). So `note.token` was ALWAYS undefined
            // here, and every `(note as any).token === "USDC"` check below
            // and downstream ALWAYS fell through to the XLM pool, no matter
            // what token the tip actually was. There is no way to know the
            // token from the note itself -- it has to be discovered by
            // scanning both pools and seeing which one actually contains a
            // matching commitment.
            const { scanForGrNotes } = await import("@/lib/shielded/grNoteScan");

            const poolCandidates: { token: "USDC" | "XLM"; contractId: string }[] = [
                { token: "USDC", contractId: process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "" },
                { token: "XLM",  contractId: process.env.NEXT_PUBLIC_POOL_V5_XLM_ID  || "" },
            ];

            let discoveredNotes: Awaited<ReturnType<typeof scanForGrNotes>> = [];
            let resolvedToken: "USDC" | "XLM" | null = null;
            let resolvedContractId = "";

            for (const candidate of poolCandidates) {
                if (!candidate.contractId) continue;
                const found = await scanForGrNotes(candidate.contractId, keys.ivk);
                if (found.length > 0) {
                    discoveredNotes = found;
                    resolvedToken = candidate.token;
                    resolvedContractId = candidate.contractId;
                    break;
                }
            }

            if (!resolvedToken || discoveredNotes.length === 0) {
                throw new Error("Note not found in NewCommitment events (checked USDC and XLM pools)");
            }

            note.token = resolvedToken;

            const client = new PoolV5Client({
                networkPassphrase: isTestnet ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015",
                rpcUrl: RPC_URL,
                contractId: resolvedContractId,
                publicKey: address, signTransaction: (await import("@stellar/freighter-api")).signTransaction as any
            });

            const discovered = discoveredNotes[0];


            const { getMerklePath, hexToDecimal } = await import("@/lib/merkle");
            // Cari commitment di berbagai kemungkinan lokasi
            const noteCommitment = note.commitment || note.v5_raw?.commitment || note.commitmentHex;
            
            if (!noteCommitment) {
            }

            const targetAmount = (note as any).v5_raw?.amount ?? (note as any).amount;
            const targetBlinding = (note as any).v5_raw?.blinding ?? (note as any).blinding;
            const cleanAmount = BigInt(targetAmount);
            const cleanBlinding = BigInt(targetBlinding);
            
            const tipFlowLib = await import("../../lib/shielded/tipFlow");

const notePkD = await diversifiedKey(keys.ivk, note.d);

const calcCommitment =
    await tipFlowLib.noteCommitment(
        cleanAmount,
        notePkD,
        cleanBlinding
    );

note.commitment = calcCommitment.toString();

            // 3. Scan pool dengan retry: Stellar RPC's getEvents() can lag behind
            // the actual chain tip by a few seconds up to a couple of minutes
            // (indexing lag), so a deposit made moments ago may not show up in
            // the very first scan. Retry a few times with a short delay instead
            // of failing immediately -- this fixes the "note not found right
            // after depositing" symptom, since the pool scan pagination itself
            // was already confirmed correct.
            const { scanAllCommitments } = await import("@/lib/shielded/grNoteScan");
            const poolContractId =
                (note as any).token === "USDC"
                    ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "")
                    : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || "");
            const MAX_SCAN_RETRIES = 5;
            const SCAN_RETRY_DELAY_MS = 4000;
            let commitments: { index: number; commitment: string }[] = [];
            for (let attempt = 1; attempt <= MAX_SCAN_RETRIES; attempt++) {
                commitments = await scanAllCommitments(poolContractId);
                if (commitments.some((c) => c.commitment === calcCommitment.toString())) {
                    break;
                }
                if (attempt < MAX_SCAN_RETRIES) {
                    await new Promise((resolve) => setTimeout(resolve, SCAN_RETRY_DELAY_MS));
                }
            }


const claimPkD = await diversifiedKey(keys.ivk, note.d);



            let finalPathElements: string[] = [];
            let finalPathIndices: string[] = [];
            let finalRoot = 0n;
            let finalLeafIndex = 0;
            try {
                const merkleData = await getMerklePath(calcCommitment.toString(), commitments);
                finalPathElements = merkleData.pathElements;
                finalPathIndices = merkleData.pathIndices;
                finalRoot = BigInt(merkleData.root || 0);
                finalLeafIndex = merkleData.leafIndex;
            } catch(e) {
                finalPathElements = new Array(20).fill("0");
                finalPathIndices = new Array(20).fill("0");
            }

            // DIAGNOSTIC (temporary): always fetch the real on-chain root for
            // comparison, regardless of whether getMerklePath succeeded, so we
            // can see directly whether our locally-reconstructed Merkle root
            // actually matches on-chain -- this is exactly what the circuit's
            // ForceEqualIfEnabled assert checks internally.
            try {
                const diagClient = new PoolV5Client({
                    networkPassphrase: isTestnet ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015",
                    rpcUrl: RPC_URL,
                    contractId: (note as any).token === "USDC" ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "") : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || ""),
                    publicKey: address
                });
                const diagRootRes = await diagClient.current_root();
                const diagOnChainRoot = BigInt(diagRootRes.result.toString());
            } catch (diagErr) {
            }

            // 4. Jika finalRoot masih 0, tarik langsung dari Smart Contract
            if (finalRoot === 0n) {
                try {
                    const tempClient = new PoolV5Client({
                        networkPassphrase: isTestnet ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015",
                        rpcUrl: RPC_URL,
                        contractId: (note as any).token === "USDC" ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "") : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || ""),
                        publicKey: address
                    });
                    const rootRes = await tempClient.current_root();
                    finalRoot = BigInt(rootRes.result.toString());
                } catch(e) {
                }
            }


            console.log("[DEBUG withdraw]", {
                token: (note as any).token,
                calcCommitment: calcCommitment.toString(),
                leafIndex: finalLeafIndex,
                merkleComputedRoot: finalRoot.toString(),
                commitmentsFound: commitments.length,
                commitmentsList: commitments.map((c) => ({ index: c.index, commitment: c.commitment })),
            });
            // DIAGNOSTIC (temporary): explicitly print the low-index leaves
            // (0-5) as found by the scan, sorted by index, plus whether each
            // index is present at all. If leafIndex 0's sibling (index 1) is
            // MISSING from this list, getMerklePath silently fell back to
            // emptyNodes[0] for that sibling -- which would explain a root
            // that still happens to match on-chain (by fluke of the sparse
            // fallback math) while the circuit's independently-reconstructed
            // leaf/path still fails ForceEqualIfEnabled internally, OR more
            // likely: the leaf itself is fine (confirmed by [DEBUG leaf-check]
            // leafMatches:true) but the PATH used to get from that leaf to
            // the root is wrong because of this missing/incorrect sibling.
            const lowIndices = [0, 1, 2, 3, 4, 5];
            console.log("[DEBUG low-index commitments]", {
                requestedLeafIndex: finalLeafIndex,
                present: lowIndices.map((i) => ({
                    index: i,
                    found: commitments.some((c) => c.index === i),
                    commitment: commitments.find((c) => c.index === i)?.commitment ?? "MISSING -> fell back to emptyNodes",
                })),
                totalCommitmentsScanned: commitments.length,
                minIndexScanned: Math.min(...commitments.map((c) => c.index)),
                maxIndexScanned: Math.max(...commitments.map((c) => c.index)),
            });
            // DIAGNOSTIC (temporary): print as a single flat string so it's
            // visible directly in a copy-pasted console log without needing
            // to expand the object tree in devtools. Also print duplicate
            // detection -- if the SAME index appears twice in commitments
            // (e.g. from an unpaginated/overlapping RPC scan), Map-based
            // dedup in getMerklePath silently keeps only the LAST one seen,
            // which could be a stale/wrong value for that index.
            const indexCounts = new Map<number, number>();
            for (const c of commitments) {
                indexCounts.set(c.index, (indexCounts.get(c.index) ?? 0) + 1);
            }
            const duplicateIndices = [...indexCounts.entries()].filter(([, n]) => n > 1);
            console.log(
                "[DEBUG low-index FLAT]",
                JSON.stringify({
                    requestedLeafIndex: finalLeafIndex,
                    lowIndexEntries: lowIndices.map((i) => {
                        const matches = commitments.filter((c) => c.index === i);
                        return { index: i, matchCount: matches.length, values: matches.map((m) => m.commitment) };
                    }),
                    duplicateIndices,
                })
            );
            try {
                const liveRootRes = await client.current_root();
                console.log("[DEBUG withdraw] live on-chain root:", BigInt(liveRootRes.result.toString()).toString());
            } catch (e) {
                console.log("[DEBUG withdraw] failed to fetch live root", e);
            }
            console.log("[DEBUG diversifier]", {
                noteD: Array.from(note.d as Uint8Array),
                keysD: Array.from(keys.d as Uint8Array),
                sameD: Array.from(note.d as Uint8Array).join(",") === Array.from(keys.d as Uint8Array).join(","),
            });

            // 5. Bangun Input ZK (Sangat Bersih)
            const builtWithdraw = await buildWithdrawInput({
                noteAmount: cleanAmount,
                blinding: cleanBlinding,
                keys: keys,
                recipientAddress: recipient || address,
                relayerAddress: address,
                poolCurrentRoot: finalRoot,
                // Bug #9 (fixed): domain must match the pool the note actually
                // lives in -- 1 for XLM, 2 for USDC (same convention as the
                // deposit side in useDepositFlow.ts). Previously hardcoded to
                // 1n for all tokens, which broke USDC claims (ForceEqualIfEnabled
                // assert failure in the withdraw circuit).
                domain: (note as any).token === "USDC" ? 2n : 1n,
                merklePathElements: finalPathElements,
                merklePathIndices: finalPathIndices,
                leafIndex: finalLeafIndex,
                noteD: note.d
            });





            // DIAGNOSTIC (temporary): recompute the leaf exactly the way the
            // circuit does (amount, pkD-fold via args.keys.pkD, blinding),
            // straight from the CircuitInput that is about to be sent, and
            // compare against calcCommitment (the value whose position in
            // the tree determined pathElements/leafIndex). If these two
            // diverge, the circuit WILL fail ForceEqualIfEnabled regardless
            // of anything else being correct -- this pinpoints it before
            // burning 5-15s on proof generation.
            try {
                const inputCheck = builtWithdraw.input;
                const recomputedLeaf = await tipFlowLib.noteCommitment(
                    BigInt(inputCheck.inAmount[0]),
                    keys.pkD,
                    BigInt(inputCheck.inBlinding[0]),
                );
                console.log("[DEBUG leaf-check]", {
                    leafIndex: finalLeafIndex,
                    calcCommitment: calcCommitment.toString(),
                    recomputedLeafFromCircuitInput: recomputedLeaf.toString(),
                    leafMatches: recomputedLeaf.toString() === calcCommitment.toString(),
                    inAmountSent: inputCheck.inAmount[0],
                    inBlindingSent: inputCheck.inBlinding[0],
                    inDSent: inputCheck.inD[0],
                    keysPkD: [keys.pkD[0].toString(), keys.pkD[1].toString()],
                    firstPathElement: inputCheck.inPathElements[0][0],
                    rootSent: inputCheck.root,
                });
            } catch (diagLeafErr) {
                console.log("[DEBUG leaf-check] failed to compute", diagLeafErr);
            }

            // 6. Generate Proof Groth16
            setClaimStage("submitting");
            setClaimStatus("Generating ZK Proof (Proses Kriptografi)...");
            const { proof } = await proveV5(builtWithdraw.input);

            // 7. Format Buffer untuk Smart Contract Soroban
            const be32 = (v: any) => BigInt(v).toString(16).padStart(64, "0");
            const g1Hex = (pi: any) => BigInt(pi[0]).toString(16).padStart(64, "0") + BigInt(pi[1]).toString(16).padStart(64, "0");
            const g2Hex = (pi: any) => BigInt(pi[0][1]).toString(16).padStart(64, "0") + BigInt(pi[0][0]).toString(16).padStart(64, "0") + BigInt(pi[1][1]).toString(16).padStart(64, "0") + BigInt(pi[1][0]).toString(16).padStart(64, "0");

            const { Buffer: DynBuffer } = await import("buffer");
            const input = builtWithdraw.input;
            const ext = builtWithdraw.ext;

            const formattedExt = {
                ext_amount: BigInt(ext.extAmount ?? (ext as any).ext_amount ?? (ext as any).amount ?? 0n),
                fee: BigInt(ext.fee ?? (ext as any).extFee ?? (ext as any).ext_fee ?? 0n),
                recipient: ext.recipient || (ext as any).recipientAddress || recipient || address,
                relayer: ext.relayer || (ext as any).relayerAddress || address,
                encrypted_output0: DynBuffer.from(ext.encryptedOutput0 || (ext as any).encrypted_output0 || []),
                encrypted_output1: DynBuffer.from(ext.encryptedOutput1 || (ext as any).encrypted_output1 || [])
            };

            const formattedProof = {
                a: DynBuffer.from(g1Hex(proof.pi_a), "hex"),
                b: DynBuffer.from(g2Hex(proof.pi_b), "hex"),
                c: DynBuffer.from(g1Hex(proof.pi_c), "hex"),
                public_amount: BigInt(input.publicAmount ?? (input as any).public_amount ?? 0n),
                root: BigInt("0x" + be32(input.root)),
                ext_data_hash: BigInt("0x" + be32(input.extDataHash)),
                input_nullifiers: (input.inputNullifier || []).map((n: any) => BigInt("0x" + be32(n))),
                output_commitments: (input.outputCommitment || []).map((c: any) => BigInt("0x" + be32(c)))
            };

            setClaimStatus("Approve the withdrawal transaction in your wallet...");
            const { signTransaction } = await import("@stellar/freighter-api");
            const poolV5ClientInstance = new PoolV5Client({
                networkPassphrase: isTestnet ? "Test SDF Network ; September 2015" : "Public Global Stellar Network ; September 2015",
                rpcUrl: RPC_URL,
                contractId: (note as any).token === "USDC" ? (process.env.NEXT_PUBLIC_POOL_V5_USDC_ID || "") : (process.env.NEXT_PUBLIC_POOL_V5_XLM_ID || ""),
                publicKey: address, 
                signTransaction: signTransaction as any
            });

            const tx = await poolV5ClientInstance.transact({
                proof: formattedProof as any,
                ext: formattedExt as any,
                sender: address
            });

            const sent = await tx.signAndSend({ force: true });

            if ((sent.result as any) === false || (sent as any).status === 'FAILED') {
                // Lempar error agar ditangkap blok catch, tapi transaksinya tetap tercatat di wallet/Stellar Expert
                throw new Error("Reverted by Smart Contract (Expected: Dummy Merkle Path). Check your Wallet / Stellar Expert!");
            }

            const hash = sent.sendTransactionResponse?.hash || "submitted-to-blockchain";
            
            setClaimStage("done");
            setClaimStatus("");
            setClaimTxHash(hash);
            
        } catch (e) {
             setClaimError((e as Error).message || "V5 Proving Failed");
            setClaimStage("error");
        } finally {
            setClaimBusy(false);
        }
        return; // Stop execution, do not fall through to V4
      }

      const client = buildClient(recipient || address, note.token);

      // Generate proof
      setClaimStage("proving");
      setClaimStatus("Generating ZK proof (5–15s)...");
      const merklePath: any = { pathElements: [], pathIndices: [] };
        const generated = await generateProof(note, merklePath, (p) => setClaimProgress(p));

      // Submit
      setClaimStage("submitting");
      setClaimStatus("Sending claim to blockchain...");
      const { proof_bytes, public_inputs } = toClaimArgs(generated);
      const claimTx = await client.claim_to({
        recipient: recipient || address,
        proof_bytes,
        public_inputs,
      });
      const sent = await claimTx.signAndSend({ force: true });

      if ((sent.result as any) === false || (sent as any).status === 'FAILED') throw new Error("Could not claim this tip. It may already be claimed, or the note doesn't match the current pool. Try refreshing.");

      const hash = sent.sendTransactionResponse?.hash ?? "submitted";
      setClaimTxHash(hash);
      // Use note.recipientAddress (creator namespace) if available,
      // fall back to connected address for legacy notes without the field.
      saveNote(note.recipientAddress ?? address, note);
      markNoteAsClaimed(note.recipientAddress ?? address, note.nullifierHash, hash);
      setClaimStage("done");
      setNoteInput("");
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Claim failed.");
      setClaimStage("error");
    } finally {
      setClaimBusy(false);
      setClaimProgress(null);
    }
  }

  function copyLink() {
    if (!tipLink) return;
    navigator.clipboard.writeText(tipLink);
    toast.success("Tip link copied");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const [tipLink, setTipLink] = useState<string | null>(null);
  const [needsGrSetup, setNeedsGrSetup] = useState(false);

  useEffect(() => {
    if (!address) {
      setTipLink(null);
      setNeedsGrSetup(false);
      return;
    }
    (async () => {
      try {
        const grAddress = await getStoredGrAddress();
        if (grAddress) {
          setTipLink("https://growthip.vercel.app/tip/" + grAddress);
          setNeedsGrSetup(false);
        } else {
          setTipLink(null);
          setNeedsGrSetup(true);
        }
      } catch {
        setTipLink(null);
        setNeedsGrSetup(true);
      }
    })();
  }, [address]);

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="p-8 bg-[#FAFAFA] dark:bg-[#0A0A0A]">
      {/* Mainnet warning overlay */}
      {isMainnet && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div className="bg-white dark:bg-[#151515]" style={{ borderRadius: "20px", maxWidth: "420px", width: "100%", padding: "28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon icon="ph:warning-circle-bold" style={{ fontSize: "28px", color: "#EF4444" }} />
            </div>
            <div>
              <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "17px", fontWeight: 800, marginBottom: "8px" }}>Mainnet not supported</p>
              <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", lineHeight: 1.6 }}>
                Growthip is currently testnet-only. Your wallet is set to <strong>Mainnet</strong> — real funds are at risk if you proceed.
                Please switch your wallet back to <strong>Testnet</strong> to continue using Growthip safely.
              </p>
            </div>
            <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#FFF7ED", border: "1px solid #FED7AA", width: "100%" }}>
              <p style={{ fontSize: "12px", color: "#9A3412", lineHeight: 1.6 }}>
                Smart contracts on mainnet are unaudited. The ZK trusted setup is not a public ceremony. <strong>Do not use with real funds.</strong>
              </p>
            </div>
            <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px" }}>Switch to Testnet in your wallet extension to dismiss this warning.</p>
          </div>
        </div>
      )}
      <div style={{ maxWidth: "700px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px", paddingBottom: "80px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {address && (
            <img
              src={avatarUrlFor(address)}
              alt="avatar"
              width={44}
              height={44}
              className="rounded-full flex-shrink-0 bg-[#F5F5F5] dark:bg-[#1E1E1E] border border-[#E5E5E5] dark:border-[#2A2A2A]"
              style={{ width: 44, height: 44 }}
            />
          )}
          <div>
            <h1 className="text-2xl font-extrabold text-[#0A0A0A] dark:text-[#FAFAFA]">Dashboard</h1>
            <p className="text-sm text-[#737373] dark:text-[#8A8A8A]">
              Welcome back{address ? `, ${displayName || address.slice(0, 4) + "..." + address.slice(-4)}` : ""}!
            </p>
          </div>
        </div>

        {/* Stealth Balances */}
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
            <span className="text-sm font-bold text-[#171717] dark:text-[#E5E5E5]">Your Wallet Balance</span>
            <InfoTooltip text="Prices via CoinGecko free API (may be rate-limited). If balance seems incorrect, check your wallet directly." />
          </div>
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <span className="text-light-950 dark:text-[#FAFAFA] font-extrabold leading-none" style={{ fontSize: "clamp(28px, 8vw, 48px)" }}>
                {formatMoney(address ? (balances.xlm * rateFor("XLM")) : 0, currency)}
              </span>
              <span className="text-sm font-semibold text-[#737373] dark:text-[#8A8A8A]" style={{ marginBottom: "6px" }}>{currency}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "6px" }}>
              {(() => {
                const totalConverted = balances.xlm * rateFor("XLM");
                const change24h = prices.xlm.usd_24h_change;
                const isUp = change24h >= 0;
                const amountChange = Math.abs(totalConverted * change24h / 100);
                return address && totalConverted > 0 ? (
                  <>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "13px", fontWeight: 700, color: isUp ? "#16a34a" : "#dc2626", WebkitTextFillColor: isUp ? "#16a34a" : "#dc2626" }}>
                      <Icon icon={isUp ? "ph:trend-up-bold" : "ph:trend-down-bold"} style={{ marginRight: "4px", color: isUp ? "#16a34a" : "#dc2626" }} />
                      {(isUp ? "+" : "") + change24h.toFixed(2)}%
                    </span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: isUp ? "rgba(22,163,74,0.8)" : "rgba(220,38,38,0.8)", WebkitTextFillColor: isUp ? "rgba(22,163,74,0.8)" : "rgba(220,38,38,0.8)" }}>
                      ({isUp ? "+" : "-"}{formatMoney(amountChange, currency)})
                    </span>
                  </>
                ) : null;
              })()}
            </div>
          </div>

          <p className="text-[11px] font-bold text-[#A3A3A3] dark:text-[#6A6A6A] uppercase tracking-widest" style={{ marginBottom: "16px" }}>Tokens</p>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {[
              {
                icon: "cryptocurrency-color:xlm", name: "XLM", sub: "Stellar Network",
                balance: balances.xlm, convertedValue: balances.xlm * rateFor("XLM"),
                change: prices.xlm.usd_24h_change, price: prices.xlm.usd, displayPrice: rateFor("XLM"),
              },
            ].map(({ icon, name, sub, balance, convertedValue, change, price, displayPrice }) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <Icon icon={icon} style={{ fontSize: "36px" }} />
                  <div>
                    <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0]">{name}</div>
                    <div className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">
                      {sub}{price > 0 && <span className="ml-1.5 text-[#A3A3A3] dark:text-[#6A6A6A]">{formatMoney(displayPrice, currency)}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0]">{balance > 0 ? balance.toFixed(2) : "0"}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "flex-end" }}>
                    <span style={{ display: "flex", alignItems: "center", fontSize: "10px", fontWeight: 700, color: change >= 0 ? "#16a34a" : "#dc2626", WebkitTextFillColor: change >= 0 ? "#16a34a" : "#dc2626" }}>
                      <Icon icon={change >= 0 ? "ph:trend-up-bold" : "ph:trend-down-bold"} style={{ marginRight: "2px", color: change >= 0 ? "#16a34a" : "#dc2626" }} />
                      {(change >= 0 ? "+" : "") + change.toFixed(2)}%
                    </span>
                    <span className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">{formatMoney(convertedValue, currency)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* USDC */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Icon icon="cryptocurrency-color:usdc" style={{ fontSize: "36px" }} />
                <div>
                  <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0] flex items-center gap-2">
                    USDC
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#2A2A2A] text-[#525252] dark:text-[#6A6A6A] uppercase tracking-wide">Soon</span>
                  </div>
                  <div className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">USD Coin</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0]">-</div>
                <div className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">$0.00</div>
              </div>
            </div>

            {/* EURC */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Icon icon="cryptocurrency-color:eur" style={{ fontSize: "36px" }} />
                <div>
                  <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0] flex items-center gap-2">
                    EURC
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#E5E5E5] dark:bg-[#2A2A2A] text-[#525252] dark:text-[#6A6A6A] uppercase tracking-wide">Soon</span>
                  </div>
                  <div className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">Euro Coin</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0]">-</div>
                <div className="text-[11px] text-[#737373] dark:text-[#8A8A8A]">€0.00</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Wallet Connection / Action Area */}
        {!address ? (
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Icon icon="ph:wallet-bold" style={{ fontSize: "18px" }} />
              <span className="text-[#171717] dark:text-[#E5E5E5]" style={{ fontSize: "14px", fontWeight: 700 }}>Wallet Connection</span>
            </div>
            <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "13px", marginBottom: "20px" }}>
              Connect your wallet to send or withdraw tips.
            </p>
            <button
              onClick={() => setShowWalletModal(true)}
              disabled={walletBusy}
              style={{ width: "100%", padding: "12px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: walletBusy ? "not-allowed" : "pointer", opacity: walletBusy ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
            >
              <Icon icon="ph:wallet" style={{ fontSize: "18px" }} />
              {walletBusy ? "Connecting..." : "Connect Wallet"}
            </button>
            {walletStatus && <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px", marginTop: "12px" }}>{walletStatus}</p>}
          </Card>
        ) : (
          /* Wallet connected - show Send/Withdraw tabs */
          <Card style={{ padding: 0 }}>
            {/* Wallet info bar */}
            <div className="border-b border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <div className="bg-[#F5F5F5] dark:bg-[#1E1E1E] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon icon="ph:wallet-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "16px" }} />
                </div>
                <span className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontFamily: "monospace", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                <span className={isTestnet ? "bg-[#F0FDF4] dark:bg-[#12271A]" : "bg-[#FEF2F2] dark:bg-[#2D1515]"} style={{ fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "999px", color: isTestnet ? "#16a34a" : "#ef4444", WebkitTextFillColor: isTestnet ? "#16a34a" : "#ef4444" }}>
                  {network === "TESTNET" ? "Testnet" : network === "FUTURENET" ? "Futurenet" : network}
                </span>
                <button
                  onClick={() => setShowWalletModal(true)}
                  title="Switch wallet"
                  className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A]"
                  style={{ width: 32, height: 32, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon icon="ph:arrows-left-right-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "14px" }} />
                </button>
                <button
                  onClick={() => {
                    setAddress("");
                    setNetwork("");
                    localStorage.removeItem("growthip:wallet");
                    localStorage.removeItem("growthip:network");
                  }}
                  title="Disconnect wallet"
                  className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A]"
                  style={{ width: 32, height: 32, borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Icon icon="ph:sign-out-bold" className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "14px" }} />
                </button>
              </div>
            </div>

            {/* Withdraw header */}
            <div className="border-b border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ padding: "14px 20px" }}>
              <p className="text-sm font-bold text-[#0A0A0A] dark:text-[#F0F0F0]">Withdraw</p>
            </div>

            {/* Withdraw */}
            {(
              <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>

                {claimStage === "done" ? (
                  <div style={{ textAlign: "center", padding: "24px 0" }}>
                    <p style={{ fontSize: "32px" }}>🎉</p>
                    <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "18px", fontWeight: 800, marginTop: "8px" }}>Tip Claimed!</p>
                    <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px", marginTop: "4px" }}>ZK proof verified. Funds transferred to your wallet.</p>
                    <div className="bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ marginTop: "16px", padding: "12px", borderRadius: "12px" }}>
                      <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px" }}>Transaction</p>
                      <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "11px", fontFamily: "monospace", wordBreak: "break-all", marginTop: "4px" }}>{claimTxHash}</p>
                    </div>
                    <button
                      onClick={() => { setClaimStage("idle"); setNoteInput(""); setClaimTxHash(""); }}
                      style={{ marginTop: "16px", padding: "12px 24px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: "pointer" }}
                    >
                      Claim another
                    </button>
                  </div>
                ) : (
                  <>
                    {needsUnlock && (
                      <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #FDE68A", background: "#FFFBEB" }}>
                        <p style={{ fontSize: "13px", fontWeight: 700, color: "#92400E", marginBottom: "8px" }}>
                          🔐 Unlock your encryption session to decrypt this note
                        </p>
                        <p style={{ fontSize: "12px", color: "#92400E", marginBottom: "12px" }}>
                          Your session expired after navigating. Enter your password to continue.
                        </p>
                        <input
                          type="password"
                          value={unlockPassword}
                          onChange={(e) => setUnlockPassword(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key !== "Enter" || unlockBusy) return;
                            setUnlockBusy(true);
                            setUnlockError("");
                            try {
                              const { unlockWithPassword } = await import("@/lib/encryption/keyManagement");
                              await unlockWithPassword(unlockPassword);
                              setNeedsUnlock(false);
                              setUnlockPassword("");
                            } catch {
                              setUnlockError("Incorrect password. Try again.");
                            } finally {
                              setUnlockBusy(false);
                            }
                          }}
                          placeholder="Enter your encryption password..."
                          disabled={unlockBusy}
                          style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #FDE68A", fontSize: "13px", marginBottom: "8px", outline: "none" }}
                        />
                        {unlockError && (
                          <p style={{ fontSize: "12px", color: "#EF4444", marginBottom: "8px" }}>{unlockError}</p>
                        )}
                        <button
                          onClick={async () => {
                            setUnlockBusy(true);
                            setUnlockError("");
                            try {
                              const { unlockWithPassword } = await import("@/lib/encryption/keyManagement");
                              await unlockWithPassword(unlockPassword);
                              setNeedsUnlock(false);
                              setUnlockPassword("");
                            } catch {
                              setUnlockError("Incorrect password. Try again.");
                            } finally {
                              setUnlockBusy(false);
                            }
                          }}
                          disabled={unlockBusy || !unlockPassword.trim()}
                          style={{ padding: "8px 16px", borderRadius: "8px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, border: "none", cursor: unlockBusy ? "not-allowed" : "pointer", opacity: unlockBusy || !unlockPassword.trim() ? 0.5 : 1 }}
                        >
                          {unlockBusy ? "Unlocking..." : "Unlock"}
                        </button>
                      </div>
                    )}
                    <div>
                      <SectionTitle>Private Note</SectionTitle>
                      <textarea
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder='Paste your private note (JSON or base64)...'
                        rows={4}
                        disabled={claimBusy}
                        className="bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] text-[#0A0A0A] dark:text-[#E5E5E5]"
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", borderRadius: "12px", padding: "12px", resize: "none", outline: "none" }}
                      />
                    </div>
                    <div>
                      <SectionTitle>Recipient Wallet</SectionTitle>
                      <input
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="G... (defaults to connected wallet)"
                        disabled={claimBusy}
                        className="bg-[#FAFAFA] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] text-[#0A0A0A] dark:text-[#E5E5E5]"
                        style={{ width: "100%", fontFamily: "monospace", fontSize: "12px", borderRadius: "12px", padding: "12px", outline: "none" }}
                      />
                    </div>

                    {claimStage === "proving" && (
                      <div style={{ padding: "16px", borderRadius: "12px", border: "1px solid #DDD6FE", background: "#FAF5FF" }}>
                        <div className="bg-[#E5E5E5] dark:bg-[#2A2A2A]" style={{ height: "6px", borderRadius: "999px", overflow: "hidden", marginBottom: "8px" }}>
                          <div style={{ height: "100%", width: "50%", borderRadius: "999px", background: "#6366f1", animation: "pulse 1.5s infinite" }} />
                        </div>
                        <p className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "12px" }}>
                          {claimProgress ?? "Generating privacy proof..."} — Please keep this tab open.
                        </p>
                      </div>
                    )}

                    {claimError && (
                      <div style={{ padding: "12px 16px", borderRadius: "12px", border: "1px solid #FCA5A5", background: "#FEF2F2" }}>
                        <p style={{ fontSize: "13px", color: "#EF4444" }}>{claimError}</p>
                      </div>
                    )}

                    <button
                      onClick={handleClaim}
                      disabled={claimBusy || !noteInput.trim() || !address}
                      style={{ width: "100%", padding: "14px", borderRadius: "12px", background: "#0A0A0A", color: "white", fontSize: "14px", fontWeight: 700, border: "none", cursor: claimBusy ? "not-allowed" : "pointer", opacity: (claimBusy || !noteInput.trim()) ? 0.5 : 1 }}
                    >
                      {claimBusy
                        ? (claimStatus || "Processing...")
                        : "Generate Proof & Withdraw"}
                    </button>
                  </>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Personal Link */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {/* Header */}
          <div className="border-b border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h2 className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700, margin: "0 0 2px" }}>Simple Payment</h2>
              <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "12px", margin: 0 }}>Your active tip link</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, padding: "3px 10px", borderRadius: "999px", background: "#F0FDF4", color: "#16a34a", WebkitTextFillColor: "#16a34a" }}>Active</span>
              <Link href="/dashboard/profile" className="border border-[#E5E5E5] dark:border-[#2A2A2A] text-[#404040] dark:text-[#D0D0D0] bg-white dark:bg-[#1A1A1A]" style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", textDecoration: "none" }}>
                <Icon icon="ph:pencil-simple-bold" style={{ fontSize: "13px" }} /> Edit Profile
              </Link>
            </div>
          </div>
          <div style={{ padding: "16px 20px" }}>
            {address ? (
              <>
                {needsGrSetup ? (
                  <div className="border border-dashed border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A]" style={{ padding: "16px", borderRadius: "12px", textAlign: "center", marginBottom: "14px" }}>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "13px", marginBottom: "10px" }}>Set up your gr address to activate this link</p>
                    <a href="/dashboard/settings" style={{ display: "inline-block", padding: "9px 16px", borderRadius: "10px", background: "#0A0A0A", color: "white", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}>Set up gr address</a>
                  </div>
                ) : (
                <>
                <div className="bg-[#F9FAFB] dark:bg-[#1A1A1A]" style={{ borderRadius: "12px", padding: "12px 14px", display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                  <img src={avatarUrlFor(address)} alt="avatar" width={40} height={40} className="border border-[#E5E5E5] dark:border-[#2A2A2A]"
                    style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 2px" }}>@{getProfile(address).displayName || address.slice(0, 6) + "..." + address.slice(-4)}</p>
                    <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "11px", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink?.replace("https://", "")}</p>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                  <button onClick={copyLink} className={["border border-[#E5E5E5] dark:border-[#2A2A2A]", copied ? "bg-[#F0FDF4] dark:bg-[#12271A]" : "bg-[#F9FAFB] dark:bg-[#1A1A1A]", copied ? "" : "text-[#0A0A0A] dark:text-[#E5E5E5]"].join(" ")} style={{ padding: "9px 4px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, color: copied ? "#22c55e" : undefined, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                    <Icon icon={copied ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "14px" }} /> {copied ? "Copied!" : "Copy"}
                  </button>
                  <button onClick={() => setShowDashShare(true)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "9px 4px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                    <Icon icon="ph:share-network-bold" style={{ fontSize: "14px" }} /> Share
                  </button>
                  <button onClick={() => setShowLinkQR(true)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "9px 4px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                    <Icon icon="ph:qr-code-bold" style={{ fontSize: "14px" }} /> QR
                  </button>
                  <a href={tipLink ?? "#"} target="_blank" rel="noreferrer" className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]" style={{ padding: "9px 4px", borderRadius: "10px", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", textDecoration: "none" }}>
                    <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} /> View
                  </a>
                </div>
                </>
                )}
              </>
            ) : (
              <div className="border border-dashed border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#FAFAFA] dark:bg-[#1A1A1A]" style={{ padding: "20px", borderRadius: "12px", textAlign: "center" }}>
                <p className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontSize: "13px" }}>Connect your wallet to get your personal tip link</p>
              </div>
            )}
          </div>
        </Card>

        {/* QR Modal for dashboard */}
        <Modal show={showLinkQR && !!tipLink} onClose={() => setShowLinkQR(false)} maxWidth="380px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div style={{ flex: 1 }} />
                <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: 0, flex: 2, textAlign: "center" }}>Your QR Code</p>
                <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => setShowLinkQR(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px" }} />
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "14px" }}>
                <div style={{ padding: "12px", background: "#22c55e", borderRadius: "18px" }}>
                  <div className="bg-white" style={{ padding: "10px", borderRadius: "10px" }}>
                    <QRCodeSVG value={tipLink ?? ""} size={160} level="M" />
                  </div>
                </div>
                <div className="bg-[#F9FAFB] dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ width: "100%", padding: "10px 14px", borderRadius: "10px" }}>
                  <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "11px", margin: 0, textAlign: "center", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tipLink}</p>
                </div>
                <button
                  onClick={() => {
                    const canvas = document.querySelector("canvas");
                    if (canvas) {
                      const url = canvas.toDataURL("image/png");
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "growthip-qr.png";
                      a.click();
                    }
                  }}
                  style={{ width: "100%", padding: "11px", borderRadius: "12px", background: "#0A0A0A", color: "white", border: "none", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  <Icon icon="ph:download-simple-bold" className="text-white" style={{ fontSize: "15px" }} /> Download QR Code
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <img src="/growthip-logo.png" alt="Growthip" style={{ width: "20px", height: "20px", objectFit: "contain" }} />
                  <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 700 }}>Growthip</span>
                </div>
              </div>
        </Modal>

        {/* Share Modal for dashboard */}
        <Modal show={showDashShare} onClose={() => setShowDashShare(false)} maxWidth="420px">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "16px", fontWeight: 800, margin: 0 }}>Share your link</p>
                <button onClick={() => setShowDashShare(false)} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F5F5F5] dark:bg-[#1E1E1E]" style={{ width: "30px", height: "30px", borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon icon="ph:x-bold" className="text-[#737373] dark:text-[#8A8A8A]" style={{ fontSize: "13px" }} />
                </button>
              </div>
              {/* Custom message */}
              <div style={{ marginBottom: "16px" }}>
                <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 8px" }}>Custom message</p>
                <textarea
                  value={dashShareMsg}
                  onChange={(e) => setDashShareMsg(e.target.value.slice(0, 280))}
                  rows={3}
                  maxLength={280}
                  placeholder="Write a message to share with your link..."
                  className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]"
                  style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", resize: "none", outline: "none", fontFamily: "inherit", boxSizing: "border-box", lineHeight: 1.5 }}
                />
                <p className={dashShareMsg.length >= 260 ? "" : "dark:text-[#6A6A6A]"} style={{ fontSize: "11px", color: dashShareMsg.length >= 260 ? "#ef4444" : "#A3A3A3", margin: "4px 0 0" }}>{dashShareMsg.length}/280</p>
              </div>
              {/* Platforms */}
              <p className="text-[#525252] dark:text-[#B0B0B0]" style={{ fontSize: "12px", fontWeight: 600, margin: "0 0 10px" }}>Share to</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                <button
                  onClick={() => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(dashShareMsg + "\n" + (tipLink ?? ""))}`, "_blank")}
                  className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "12px", cursor: "pointer" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Icon icon="ri:twitter-x-fill" className="text-black dark:text-white" style={{ fontSize: "20px" }} />
                    <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 600 }}>X (Twitter)</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F0FDF4", color: "#22c55e" }}>Available</span>
                </button>
                {[{ icon: "ri:discord-fill", label: "Discord", color: "#5865F2" }, { icon: "ri:twitch-fill", label: "Twitch", color: "#9146FF" }].map((p) => (
                  <div key={p.label} className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A]" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", borderRadius: "12px", opacity: 0.5 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Icon icon={p.icon} style={{ fontSize: "20px", color: p.color }} />
                      <span className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "13px", fontWeight: 600 }}>{p.label}</span>
                    </div>
                    <span className="dark:bg-[#2A2A2A] dark:text-[#6A6A6A]" style={{ fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "999px", background: "#F5F5F5", color: "#A3A3A3" }}>Coming soon</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(dashShareMsg + "\n" + (tipLink ?? "")); toast.success("Message and link copied"); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="border border-[#E5E5E5] dark:border-[#2A2A2A] bg-[#F9FAFB] dark:bg-[#1A1A1A] text-[#0A0A0A] dark:text-[#E5E5E5]"
                style={{ width: "100%", padding: "11px", borderRadius: "12px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
              >
                <Icon icon={copied ? "ph:check-bold" : "ph:copy-simple-bold"} style={{ fontSize: "15px", color: copied ? "#22c55e" : undefined }} className={copied ? "" : "text-[#0A0A0A] dark:text-[#E5E5E5]"} />
                {copied ? "Copied!" : "Copy message + link"}
              </button>
        </Modal>



        <WalletModal
            show={showWalletModal}
            onClose={() => setShowWalletModal(false)}
            onSelectWallet={async (walletId) => {
              setWalletBusy(true);
              setWalletStatus("Connecting...");
              try {
                const { connectWithWallet } = await import("@/lib/wallet");
                // Clear session key from previous wallet before switching
                const { lockSession } = await import("@/lib/encryption/keyManagement");
                lockSession();
                const addr = await connectWithWallet(walletId);
                setAddress(addr);
                localStorage.setItem("growthip:wallet", addr);
                setRecipient(addr);
                setNetwork("TESTNET");
                localStorage.setItem("growthip:network", "TESTNET");
                void warmPoseidon();
                setWalletStatus("Connected!");
                refetchBalances();
                void autoRegisterRecipient(addr);
                setShowWalletModal(false);
              } catch (err) {
                setWalletStatus(err instanceof Error ? err.message : "Failed.");
              } finally {
                setWalletBusy(false);
              }
            }}
            connecting={walletBusy}
          />
      </div>
    </div>
  )
};
