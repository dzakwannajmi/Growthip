"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { QRCodeSVG } from "qrcode.react";
import WalletModal from "@/components/WalletModal";
import AmountSelector from "@/components/AmountSelector";
import { useDepositFlow } from "@/hooks/useDepositFlow";
import {
    parseCampaignRoute,
    getCampaignProgress,
    wrapCampaignMessage,
    type CampaignMetadata,
    type CampaignProgress,
} from "@/lib/campaign";
import {
    getToken,
    getAvailableTokens,
    fromBaseUnits,
    type Token,
    type TokenSymbol,
} from "@/lib/tokens";
import { getProfile, avatarUrlFor } from "@/lib/profile";

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI primitive — identical to /tip/[id]/page.tsx so JSX stays familiar
// ─────────────────────────────────────────────────────────────────────────────

function Card({
    children,
    style,
}: {
    children: React.ReactNode;
    style?: React.CSSProperties;
}) {
    return (
        <div
            style={{
                background: "white",
                borderRadius: "16px",
                border: "1px solid #E5E5E5",
                padding: "24px",
                ...style,
            }}
        >
            {children}
        </div>
    );
}

/**
 * Converts a Unix timestamp (seconds) into a human-readable deadline label.
 * Returns "Ended" when the timestamp is in the past.
 */
function formatDeadline(ts: number): string {
    const diff = ts - Math.floor(Date.now() / 1000);
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / 86400);
    if (days > 0) return `${days} day${days === 1 ? "" : "s"} left`;
    const hours = Math.floor(diff / 3600);
    if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"} left`;
    const mins = Math.floor(diff / 60);
    return `${mins} min${mins === 1 ? "" : "s"} left`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner page — must live inside <Suspense> because it calls useSearchParams()
// ─────────────────────────────────────────────────────────────────────────────

function CampaignPageInner() {
    const params = useParams();
    const searchParams = useSearchParams();

    const tipId =
        typeof params.tipId === "string" ? params.tipId : "";
    const campaignId =
        typeof params.campaignId === "string" ? params.campaignId : "";

    // ── Route decode ──────────────────────────────────────────────────────────
    const [linkError, setLinkError] = useState("");
    const [recipientAddress, setRecipientAddress] = useState<string | null>(null);
    const [creatorDisplayName, setCreatorDisplayName] = useState("");
    const [creatorAvatarVariant, setCreatorAvatarVariant] = useState("");
    const [campaignMeta, setCampaignMeta] = useState<CampaignMetadata | null>(
        null
    );
    // campaignToken is fixed for the lifetime of this page — no TokenSelector.
    // Supporters can't switch tokens on a campaign because getCampaignProgress()
    // scans a single pool contract; a deposit into a different pool would never
    // appear in this campaign's progress tally. See campaign.ts for rationale.
    const [campaignToken, setCampaignToken] = useState<Token>(
        getAvailableTokens()[0]
    );

    useEffect(() => {
        if (!tipId || !campaignId) return;
        try {
            // parseCampaignRoute calls decodeTipId internally and returns
            // recipientAddress on the metadata object — no need to call it twice.
            const meta = parseCampaignRoute(tipId, campaignId, searchParams);
            setRecipientAddress(meta.recipientAddress);
            setCampaignMeta(meta);

            const p = getProfile(meta.recipientAddress);
            setCreatorDisplayName(p.displayName);
            setCreatorAvatarVariant(p.avatarVariant);

            const tok =
                getToken(meta.tokenSymbol as TokenSymbol) ?? getAvailableTokens()[0];
            setCampaignToken(tok);
        } catch {
            setLinkError("This campaign link is invalid or corrupted.");
        }
    }, [tipId, campaignId, searchParams]);

    // ── buildMessage: prefix encrypted bundle with campaign tag ──────────────
    // Passed to useDepositFlow so every deposit into this campaign carries both
    // the campaign tag (for progress tracking) and the encrypted note (for the
    // creator's auto-fetch/claim flow) in a single message field — see
    // wrapCampaignMessage() in lib/campaign.ts.
    const buildMessage = useCallback(
        (encryptedBundle: string) => wrapCampaignMessage(campaignId, encryptedBundle),
        [campaignId]
    );

    // ── Deposit flow hook ─────────────────────────────────────────────────────
    const {
        premiumChecked,
        creatorIsPremium,
        address,
        isTestnet,
        walletBusy,
        showWalletModal,
        walletStatus,
        setShowWalletModal,
        connectWallet,
        handleSelectWallet,
        step,
        setStep,
        setToken,
        contractAmount,
        setContractAmount,
        displayAmount,
        setDisplayAmount,
        fetchNetworkFee,
        poolTipAmount,
        busy,
        status,
        sentNote,
        encryptedNoteBundle,
        handleDeposit,
    } = useDepositFlow(recipientAddress, buildMessage);

    // Lock the hook's internal token state to the campaign's configured token.
    // The hook initialises to getAvailableTokens()[0] (XLM); we override it
    // once campaignToken is resolved so buildClient() picks the right pool.
    useEffect(() => {
        setToken(campaignToken);
    }, [campaignToken, setToken]);

    // ── Progress tracking ─────────────────────────────────────────────────────
    const [progress, setProgress] = useState<CampaignProgress | null>(null);
    const [progressLoading, setProgressLoading] = useState(false);

    // Dynamic import of the pool client module, same pattern as useDepositFlow.
    const [PoolClientMod, setPoolClientMod] = useState<null | {
        Client: typeof import("@/lib/growthipPoolClient").Client;
        networks: typeof import("@/lib/growthipPoolClient").networks;
    }>(null);

    useEffect(() => {
        import("@/lib/growthipPoolClient").then((mod) =>
            setPoolClientMod({ Client: mod.Client, networks: mod.networks })
        );
    }, []);

    const fetchProgress = useCallback(async () => {
        if (!PoolClientMod || !campaignMeta) return;
        setProgressLoading(true);
        try {
            const { Client, networks } = PoolClientMod;
            // Pool selection mirrors useDepositFlow's buildClient() exactly:
            // USDC → NEXT_PUBLIC_POOL_USDC_ID, everything else → testnet.contractId
            // (XLM pool). Keep in sync if the hook ever adds EURC support.
            const poolId =
                campaignToken.symbol === "USDC"
                    ? process.env.NEXT_PUBLIC_POOL_USDC_ID || networks.testnet.contractId
                    : networks.testnet.contractId;

            // Read-only client — no publicKey or signTransaction needed for
            // total_deposits() / get_message() / get_commitment_amount().
            const client = new Client({
                ...networks.testnet,
                contractId: poolId,
                rpcUrl:
                    process.env.NEXT_PUBLIC_RPC_URL ||
                    "https://soroban-testnet.stellar.org",
            });

            const prog = await getCampaignProgress(
                client,
                campaignMeta.campaignId,
                campaignMeta.goalAmount
            );
            setProgress(prog);
        } catch (e) {
            console.error("Failed to fetch campaign progress:", e);
        } finally {
            setProgressLoading(false);
        }
    }, [PoolClientMod, campaignMeta, campaignToken]);

    // Initial fetch once both PoolClientMod and campaignMeta are ready.
    useEffect(() => {
        void fetchProgress();
    }, [fetchProgress]);

    // Re-fetch immediately after a successful deposit so the progress bar
    // reflects the supporter's own contribution without a page reload.
    useEffect(() => {
        if (step === "done") void fetchProgress();
    }, [step, fetchProgress]);

    // ── UI-only state ─────────────────────────────────────────────────────────
    const [copiedNote, setCopiedNote] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const fmtDisplay = (n: number) =>
        n % 1 === 0 ? String(n) : n.toFixed(1);

    const shortAddr = recipientAddress
        ? `${recipientAddress.slice(0, 4)}...${recipientAddress.slice(-4)}`
        : "";

    // ── Error / loading guards ────────────────────────────────────────────────
    if (linkError) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    background: "#FAFAFA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "24px",
                }}
            >
                <div style={{ textAlign: "center", maxWidth: "360px" }}>
                    <Icon
                        icon="ph:link-break-bold"
                        style={{ fontSize: "40px", color: "#A3A3A3" }}
                    />
                    <p
                        style={{
                            fontSize: "18px",
                            fontWeight: 800,
                            color: "#0A0A0A",
                            marginTop: "12px",
                        }}
                    >
                        Invalid Campaign Link
                    </p>
                    <p style={{ fontSize: "14px", color: "#737373", marginTop: "6px" }}>
                        {linkError}
                    </p>
                </div>
            </div>
        );
    }

    if (!recipientAddress || !campaignMeta) {
        return (
            <div
                style={{
                    minHeight: "100vh",
                    background: "#FAFAFA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                }}
            >
                <Icon
                    icon="ph:spinner-bold"
                    style={{
                        fontSize: "28px",
                        color: "#A3A3A3",
                        animation: "spin 1s linear infinite",
                    }}
                />
            </div>
        );
    }

    // ── Derived display values ────────────────────────────────────────────────
    const goalDisplay = fromBaseUnits(campaignMeta.goalAmount, campaignToken);
    const raisedDisplay =
        progress !== null
            ? fromBaseUnits(Number(progress.totalRaised), campaignToken)
            : null;
    const progressPct = progress ? Math.round(progress.progressRatio * 100) : 0;
    const deadlineExpired =
        campaignMeta.deadline !== null &&
        campaignMeta.deadline - Math.floor(Date.now() / 1000) <= 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ minHeight: "100vh", background: "#FAFAFA", padding: "32px 16px" }}>
            <div
                style={{
                    maxWidth: "480px",
                    margin: "0 auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}
            >
                {/* ── Header ── */}
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                    {creatorDisplayName ? (
                        <img
                            src={avatarUrlFor(recipientAddress, creatorAvatarVariant)}
                            alt={creatorDisplayName}
                            width={48}
                            height={48}
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: "50%",
                                border: "1px solid #E5E5E5",
                                background: "#F5F5F5",
                                margin: "0 auto 12px",
                                display: "block",
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 48,
                                height: 48,
                                borderRadius: "50%",
                                background: "#F5F5F5",
                                border: "2px dashed #D4D4D4",
                                margin: "0 auto 12px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <Icon
                                icon="ph:user-circle-dashed-bold"
                                style={{ fontSize: "28px", color: "#A3A3A3" }}
                            />
                        </div>
                    )}

                    <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0A0A0A" }}>
                        {campaignMeta.title}
                    </h1>
                    {creatorDisplayName && (
                        <p style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}>
                            by {creatorDisplayName}
                        </p>
                    )}
                    <p
                        style={{
                            fontSize: "11px",
                            color: "#A3A3A3",
                            marginTop: "2px",
                            fontFamily: "monospace",
                        }}
                    >
                        {shortAddr}
                    </p>
                </div>

                {/* ── Campaign progress card ── */}
                <Card>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>

                        {/* Raised / goal row */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                            }}
                        >
                            <div>
                                {progressLoading || raisedDisplay === null ? (
                                    <p style={{ fontSize: "22px", fontWeight: 800, color: "#A3A3A3" }}>
                                        —
                                    </p>
                                ) : (
                                    <p style={{ fontSize: "22px", fontWeight: 800, color: "#0A0A0A" }}>
                                        {fmtDisplay(raisedDisplay)}{" "}
                                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#737373" }}>
                                            {campaignToken.symbol}
                                        </span>
                                    </p>
                                )}
                                <p style={{ fontSize: "12px", color: "#737373", marginTop: "2px" }}>
                                    raised
                                </p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <p style={{ fontSize: "15px", fontWeight: 700, color: "#525252" }}>
                                    {fmtDisplay(goalDisplay)} {campaignToken.symbol}
                                </p>
                                <p style={{ fontSize: "12px", color: "#737373", marginTop: "2px" }}>
                                    goal
                                </p>
                            </div>
                        </div>

                        {/* Progress bar */}
                        <div
                            style={{
                                height: "8px",
                                borderRadius: "999px",
                                background: "#E5E5E5",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${progressPct}%`,
                                    borderRadius: "999px",
                                    background: progressPct >= 100 ? "#22c55e" : "#0A0A0A",
                                    transition: "width 0.4s ease",
                                }}
                            />
                        </div>

                        {/* Stats row */}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                            }}
                        >
                            <span style={{ fontSize: "12px", color: "#737373" }}>
                                {progressLoading
                                    ? "Loading..."
                                    : `${progressPct}% funded · ${progress?.depositCount ?? 0} supporter${(progress?.depositCount ?? 0) !== 1 ? "s" : ""
                                    }`}
                            </span>
                            {campaignMeta.deadline !== null && (
                                <span
                                    style={{
                                        fontSize: "12px",
                                        fontWeight: 600,
                                        color: deadlineExpired ? "#EF4444" : "#525252",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "4px",
                                    }}
                                >
                                    <Icon icon="ph:clock-bold" style={{ fontSize: "13px" }} />
                                    {formatDeadline(campaignMeta.deadline)}
                                </span>
                            )}
                        </div>

                    </div>
                </Card>

                {/* ── Privacy badge ── */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "center",
                        padding: "8px 14px",
                        borderRadius: "999px",
                        background: "#F0FDF4",
                        border: "1px solid #BBF7D0",
                        margin: "0 auto",
                    }}
                >
                    <Icon
                        icon="ph:shield-check-bold"
                        style={{ fontSize: "14px", color: "#22c55e" }}
                    />
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#22c55e" }}>
                        Zero-knowledge — your identity stays private
                    </span>
                </div>

                {/* ── Testnet warning ── */}
                <div
                    style={{
                        borderRadius: "12px",
                        border: "1px solid #FCA5A5",
                        background: "#FEF2F2",
                        padding: "12px 16px",
                    }}
                >
                    <p style={{ fontSize: "13px", fontWeight: 700, color: "#EF4444" }}>
                        Testnet Only
                    </p>
                    <p style={{ fontSize: "12px", color: "#737373", marginTop: "2px" }}>
                        This uses testnet tokens. Do not use real funds.
                    </p>
                </div>

                {/* ── Wallet not connected ── */}
                {!address ? (
                    <Card>
                        <p
                            style={{
                                fontSize: "14px",
                                color: "#737373",
                                marginBottom: "16px",
                                textAlign: "center",
                            }}
                        >
                            Connect your wallet to back this campaign.
                        </p>
                        <button
                            onClick={connectWallet}
                            disabled={walletBusy}
                            style={{
                                width: "100%",
                                padding: "12px",
                                borderRadius: "12px",
                                background: "#0A0A0A",
                                color: "white",
                                fontSize: "14px",
                                fontWeight: 700,
                                border: "none",
                                cursor: walletBusy ? "not-allowed" : "pointer",
                                opacity: walletBusy ? 0.6 : 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                            }}
                        >
                            <Icon icon="ph:wallet" style={{ fontSize: "18px" }} />
                            {walletBusy ? "Connecting..." : "Connect Wallet"}
                        </button>
                        {walletStatus && (
                            <p
                                style={{
                                    fontSize: "12px",
                                    color: "#737373",
                                    marginTop: "12px",
                                    textAlign: "center",
                                }}
                            >
                                {walletStatus}
                            </p>
                        )}
                    </Card>
                ) : (
                    <>
                        {/* ── Connected wallet indicator ── */}
                        {/* Browser wallet extensions are a single global account, not
                per-tab — make it explicit which wallet is active since the
                page can't switch it programmatically. */}
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                borderRadius: "10px",
                                border: "1px solid #E5E5E5",
                                background: "white",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <Icon
                                    icon="ph:wallet-bold"
                                    style={{ fontSize: "14px", color: "#737373" }}
                                />
                                <span style={{ fontSize: "12px", color: "#737373" }}>
                                    Connected:
                                </span>
                                <span
                                    style={{
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#171717",
                                        fontFamily: "monospace",
                                    }}
                                >
                                    {address.slice(0, 4)}...{address.slice(-4)}
                                </span>
                            </div>
                            <span style={{ fontSize: "11px", color: "#A3A3A3" }}>
                                Switch in your wallet
                            </span>
                        </div>

                        {/* ── Self-tip warning ── */}
                        {address === recipientAddress && (
                            <div
                                style={{
                                    padding: "12px 14px",
                                    borderRadius: "10px",
                                    border: "1px solid #FDE68A",
                                    background: "#FFFBEB",
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: "8px",
                                }}
                            >
                                <Icon
                                    icon="ph:warning-bold"
                                    style={{
                                        fontSize: "16px",
                                        color: "#92400E",
                                        flexShrink: 0,
                                        marginTop: "1px",
                                    }}
                                />
                                <p style={{ fontSize: "12px", color: "#92400E", lineHeight: 1.5 }}>
                                    Your connected wallet is the same as this campaign&apos;s
                                    recipient. You&apos;re about to back your own campaign. If
                                    that&apos;s not intended, switch accounts inside your wallet
                                    extension first.
                                </p>
                            </div>
                        )}

                        <Card>
                            {/* ── Step: select — creator not premium ── */}
                            {step === "select" && premiumChecked && !creatorIsPremium && (
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "12px",
                                        alignItems: "center",
                                        textAlign: "center",
                                        padding: "12px 0",
                                    }}
                                >
                                    <Icon
                                        icon="ph:lock-key-bold"
                                        style={{ fontSize: "32px", color: "#A3A3A3" }}
                                    />
                                    <p
                                        style={{ fontSize: "15px", fontWeight: 700, color: "#171717" }}
                                    >
                                        This creator hasn&apos;t activated private notes yet
                                    </p>
                                    <p
                                        style={{
                                            fontSize: "13px",
                                            color: "#737373",
                                            lineHeight: 1.6,
                                            maxWidth: "320px",
                                        }}
                                    >
                                        Growthip requires creators to activate end-to-end encrypted
                                        notes before they can receive contributions. Share this link
                                        with them so they can turn it on.
                                    </p>
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(window.location.href);
                                        }}
                                        style={{
                                            marginTop: "8px",
                                            padding: "10px 16px",
                                            borderRadius: "10px",
                                            background: "#0A0A0A",
                                            color: "white",
                                            border: "none",
                                            fontSize: "13px",
                                            fontWeight: 700,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                        }}
                                    >
                                        <Icon icon="ph:copy-simple-bold" />
                                        Copy Link to Share
                                    </button>
                                </div>
                            )}

                            {/* ── Step: select — creator is premium ── */}
                            {step === "select" && premiumChecked && creatorIsPremium && (
                                <div
                                    style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                                >
                                    {/* Token locked indicator — replaces TokenSelector.
                      Token is fixed to the campaign's configured token;
                      supporters cannot switch it here. */}
                                    <div>
                                        <p
                                            style={{
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                color: "#A3A3A3",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.1em",
                                                marginBottom: "8px",
                                            }}
                                        >
                                            Token
                                        </p>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                padding: "10px 12px",
                                                borderRadius: "10px",
                                                background: "#FAFAFA",
                                                border: "1px solid #E5E5E5",
                                            }}
                                        >
                                            {campaignToken.logoUrl && (
                                                <img
                                                    src={campaignToken.logoUrl}
                                                    alt={campaignToken.symbol}
                                                    width={20}
                                                    height={20}
                                                    style={{ borderRadius: "50%", flexShrink: 0 }}
                                                />
                                            )}
                                            <span
                                                style={{ fontSize: "13px", fontWeight: 700, color: "#0A0A0A" }}
                                            >
                                                {campaignToken.name}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: "11px",
                                                    color: "#A3A3A3",
                                                    marginLeft: "auto",
                                                }}
                                            >
                                                Fixed for this campaign
                                            </span>
                                        </div>
                                    </div>

                                    <AmountSelector
                                        key={campaignToken.symbol}
                                        token={{
                                            ...campaignToken,
                                            presets:
                                                poolTipAmount !== null
                                                    ? [1, 5, 10, 20].map((m) => (poolTipAmount * m) / 1e7)
                                                    : campaignToken.presets,
                                        }}
                                        onAmountChange={(ca, da) => {
                                            setContractAmount(ca);
                                            setDisplayAmount(da);
                                            fetchNetworkFee();
                                        }}
                                    />

                                    {poolTipAmount !== null && (
                                        <p style={{ fontSize: "11px", color: "#A3A3A3" }}>
                                            Minimum contribution: {poolTipAmount / 1e7}{" "}
                                            {campaignToken.symbol}
                                        </p>
                                    )}

                                    {/* Fee breakdown — only visible once an amount is selected */}
                                    {contractAmount > 0 && (
                                        <div
                                            style={{
                                                padding: "16px",
                                                borderRadius: "12px",
                                                border: "1px solid #D1FAE5",
                                                background: "#F0FDF4",
                                            }}
                                        >
                                            <p style={{ fontSize: "12px", color: "#737373" }}>
                                                You will send
                                            </p>
                                            <p
                                                style={{
                                                    fontSize: "20px",
                                                    fontWeight: 800,
                                                    color: "#0A0A0A",
                                                }}
                                            >
                                                {fmtDisplay(displayAmount)} {campaignToken.symbol}
                                            </p>
                                            <div
                                                style={{
                                                    marginTop: "10px",
                                                    paddingTop: "10px",
                                                    borderTop: "1px solid #D1FAE5",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    gap: "4px",
                                                }}
                                            >
                                                {/* Platform fee row */}
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        fontSize: "12px",
                                                        color: "#737373",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                        }}
                                                    >
                                                        Platform fee (1%)
                                                        <span
                                                            style={{ position: "relative", display: "inline-flex" }}
                                                            onMouseEnter={(e) => {
                                                                const t = e.currentTarget.querySelector(
                                                                    "[data-tooltip]"
                                                                ) as HTMLElement;
                                                                if (t) t.style.display = "block";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                const t = e.currentTarget.querySelector(
                                                                    "[data-tooltip]"
                                                                ) as HTMLElement;
                                                                if (t) t.style.display = "none";
                                                            }}
                                                        >
                                                            <Icon
                                                                icon="ph:info-bold"
                                                                style={{
                                                                    fontSize: "12px",
                                                                    color: "#A3A3A3",
                                                                    cursor: "pointer",
                                                                }}
                                                            />
                                                            <span
                                                                data-tooltip
                                                                style={{
                                                                    display: "none",
                                                                    position: "absolute",
                                                                    bottom: "calc(100% + 8px)",
                                                                    left: "50%",
                                                                    transform: "translateX(-50%)",
                                                                    background: "white",
                                                                    color: "#171717",
                                                                    fontSize: "12px",
                                                                    borderRadius: "12px",
                                                                    padding: "10px 12px",
                                                                    width: "220px",
                                                                    zIndex: 50,
                                                                    lineHeight: 1.6,
                                                                    pointerEvents: "none",
                                                                    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                                                                    border: "1px solid #E5E5E5",
                                                                    whiteSpace: "normal",
                                                                    fontWeight: 400,
                                                                }}
                                                            >
                                                                A small 1% fee goes to Growthip to keep the
                                                                platform running. This is automatically deducted
                                                                when the creator withdraws — you always send the
                                                                full amount you choose.
                                                                <span
                                                                    style={{
                                                                        position: "absolute",
                                                                        bottom: "-5px",
                                                                        left: "50%",
                                                                        transform:
                                                                            "translateX(-50%) rotate(45deg)",
                                                                        width: "8px",
                                                                        height: "8px",
                                                                        background: "white",
                                                                        border: "1px solid #E5E5E5",
                                                                        borderTop: "none",
                                                                        borderLeft: "none",
                                                                        display: "block",
                                                                    }}
                                                                />
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span>
                                                        ~{(displayAmount * 0.01).toFixed(2)}{" "}
                                                        {campaignToken.symbol}
                                                    </span>
                                                </div>

                                                {/* Network fee row */}
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        fontSize: "12px",
                                                        color: "#737373",
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "4px",
                                                        }}
                                                    >
                                                        Est. network fee
                                                        <span
                                                            style={{ position: "relative", display: "inline-flex" }}
                                                            onMouseEnter={(e) => {
                                                                const t = e.currentTarget.querySelector(
                                                                    "[data-tooltip]"
                                                                ) as HTMLElement;
                                                                if (t) t.style.display = "block";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                const t = e.currentTarget.querySelector(
                                                                    "[data-tooltip]"
                                                                ) as HTMLElement;
                                                                if (t) t.style.display = "none";
                                                            }}
                                                        >
                                                            <Icon
                                                                icon="ph:info-bold"
                                                                style={{
                                                                    fontSize: "12px",
                                                                    color: "#A3A3A3",
                                                                    cursor: "pointer",
                                                                }}
                                                            />
                                                            <span
                                                                data-tooltip
                                                                style={{
                                                                    display: "none",
                                                                    position: "absolute",
                                                                    bottom: "calc(100% + 8px)",
                                                                    left: "50%",
                                                                    transform: "translateX(-50%)",
                                                                    background: "white",
                                                                    color: "#171717",
                                                                    fontSize: "12px",
                                                                    borderRadius: "12px",
                                                                    padding: "10px 12px",
                                                                    width: "220px",
                                                                    zIndex: 50,
                                                                    lineHeight: 1.6,
                                                                    pointerEvents: "none",
                                                                    boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
                                                                    border: "1px solid #E5E5E5",
                                                                    whiteSpace: "normal",
                                                                    fontWeight: 400,
                                                                }}
                                                            >
                                                                This is an estimate of the small fee paid to the
                                                                Stellar network — like a postage stamp for your
                                                                contribution. The actual amount may vary slightly.
                                                                <span
                                                                    style={{
                                                                        position: "absolute",
                                                                        bottom: "-5px",
                                                                        left: "50%",
                                                                        transform:
                                                                            "translateX(-50%) rotate(45deg)",
                                                                        width: "8px",
                                                                        height: "8px",
                                                                        background: "white",
                                                                        border: "1px solid #E5E5E5",
                                                                        borderTop: "none",
                                                                        borderLeft: "none",
                                                                        display: "block",
                                                                    }}
                                                                />
                                                            </span>
                                                        </span>
                                                    </span>
                                                    <span>~0.134 XLM</span>
                                                </div>

                                                {/* Creator receives row */}
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        fontSize: "12px",
                                                        fontWeight: 700,
                                                        color: "#0A0A0A",
                                                        marginTop: "4px",
                                                        paddingTop: "4px",
                                                        borderTop: "1px solid #D1FAE5",
                                                    }}
                                                >
                                                    <span>Creator receives</span>
                                                    <span>
                                                        ~{(displayAmount * 0.99).toFixed(2)}{" "}
                                                        {campaignToken.symbol}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <button
                                        onClick={() => setStep("confirm")}
                                        disabled={!isTestnet || contractAmount === 0}
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: contractAmount > 0 ? "#0A0A0A" : "#E5E5E5",
                                            color: contractAmount > 0 ? "white" : "#A3A3A3",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            border: "none",
                                            cursor: contractAmount > 0 ? "pointer" : "not-allowed",
                                        }}
                                    >
                                        {contractAmount > 0
                                            ? `Continue — ${fmtDisplay(displayAmount)} ${campaignToken.symbol}`
                                            : "Select an amount"}
                                    </button>
                                </div>
                            )}

                            {/* ── Step: confirm ── */}
                            {step === "confirm" && (
                                <div
                                    style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                                >
                                    <p
                                        style={{ fontSize: "16px", fontWeight: 700, color: "#0A0A0A" }}
                                    >
                                        Confirm Contribution
                                    </p>

                                    {[
                                        ["Amount", `${fmtDisplay(displayAmount)} ${campaignToken.symbol}`],
                                        ["Campaign", campaignMeta.title],
                                        ["To", shortAddr],
                                    ].map(([l, v]) => (
                                        <div
                                            key={l}
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                padding: "12px 16px",
                                                borderRadius: "10px",
                                                border: "1px solid #E5E5E5",
                                                background: "#FAFAFA",
                                            }}
                                        >
                                            <span style={{ fontSize: "13px", color: "#A3A3A3" }}>
                                                {l}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: "13px",
                                                    fontWeight: 600,
                                                    color: "#0A0A0A",
                                                    textAlign: "right",
                                                    maxWidth: "220px",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                            >
                                                {v}
                                            </span>
                                        </div>
                                    ))}

                                    <div
                                        style={{
                                            padding: "12px 14px",
                                            borderRadius: "12px",
                                            border: "1px solid #E5E5E5",
                                            background: "#FAFAFA",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "6px",
                                        }}
                                    >
                                        <p
                                            style={{
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                color: "#A3A3A3",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.1em",
                                                marginBottom: "2px",
                                            }}
                                        >
                                            Fee Estimate
                                        </p>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontSize: "12px",
                                                color: "#737373",
                                            }}
                                        >
                                            <span>Platform fee (1%)</span>
                                            <span>
                                                ~{(displayAmount * 0.01).toFixed(2)} {campaignToken.symbol}
                                            </span>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontSize: "12px",
                                                color: "#737373",
                                            }}
                                        >
                                            <span>Est. network fee</span>
                                            <span>~0.134 XLM</span>
                                        </div>
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                fontSize: "12px",
                                                fontWeight: 700,
                                                color: "#0A0A0A",
                                                paddingTop: "6px",
                                                borderTop: "1px solid #E5E5E5",
                                                marginTop: "2px",
                                            }}
                                        >
                                            <span>Creator receives</span>
                                            <span>
                                                ~{(displayAmount * 0.99).toFixed(2)} {campaignToken.symbol}
                                            </span>
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: "14px",
                                            borderRadius: "12px",
                                            border: "1px solid #DDD6FE",
                                            background: "#FAF5FF",
                                        }}
                                    >
                                        <p
                                            style={{ fontSize: "13px", color: "#525252", lineHeight: 1.6 }}
                                        >
                                            A private note will be generated after sending — save it,
                                            it&apos;s the only way the creator can claim this contribution.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleDeposit}
                                        disabled={busy}
                                        style={{
                                            width: "100%",
                                            padding: "14px",
                                            borderRadius: "12px",
                                            background: "#0A0A0A",
                                            color: "white",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            border: "none",
                                            cursor: busy ? "not-allowed" : "pointer",
                                            opacity: busy ? 0.7 : 1,
                                        }}
                                    >
                                        {busy
                                            ? status || "Processing..."
                                            : `Send ${fmtDisplay(displayAmount)} ${campaignToken.symbol}`}
                                    </button>

                                    <button
                                        onClick={() => setStep("select")}
                                        disabled={busy}
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: "transparent",
                                            color: "#525252",
                                            fontSize: "14px",
                                            fontWeight: 600,
                                            border: "1px solid #E5E5E5",
                                            cursor: "pointer",
                                        }}
                                    >
                                        Back
                                    </button>
                                </div>
                            )}

                            {/* ── Step: done ── */}
                            {step === "done" && sentNote && (
                                <div
                                    style={{ display: "flex", flexDirection: "column", gap: "12px" }}
                                >
                                    <div style={{ textAlign: "center", padding: "16px 0" }}>
                                        <Icon
                                            icon="ph:check-circle-bold"
                                            style={{ fontSize: "36px", color: "#22c55e" }}
                                        />
                                        <p
                                            style={{
                                                fontSize: "18px",
                                                fontWeight: 800,
                                                color: "#0A0A0A",
                                                marginTop: "8px",
                                            }}
                                        >
                                            Contribution sent!
                                        </p>
                                        <p
                                            style={{ fontSize: "13px", color: "#737373", marginTop: "4px" }}
                                        >
                                            Send this private note to the creator so they can claim it.
                                        </p>
                                    </div>

                                    <div
                                        style={{
                                            padding: "12px 14px",
                                            borderRadius: "10px",
                                            border: "1px solid #D1FAE5",
                                            background: "#F0FDF4",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <Icon
                                            icon="ph:lock-key-bold"
                                            style={{ fontSize: "16px", color: "#22C55E" }}
                                        />
                                        <p style={{ fontSize: "12px", color: "#15803D" }}>
                                            This note is end-to-end encrypted — only the creator can
                                            read it.
                                        </p>
                                    </div>

                                    <div
                                        style={{
                                            padding: "16px",
                                            borderRadius: "12px",
                                            border: "1px solid #E5E5E5",
                                            background: "#FAFAFA",
                                        }}
                                    >
                                        <p
                                            style={{
                                                fontSize: "11px",
                                                fontWeight: 700,
                                                color: "#A3A3A3",
                                                textTransform: "uppercase",
                                                letterSpacing: "0.1em",
                                                marginBottom: "8px",
                                            }}
                                        >
                                            Encrypted Note
                                        </p>
                                        <textarea
                                            readOnly
                                            rows={6}
                                            value={encryptedNoteBundle ?? ""}
                                            onFocus={(e) => e.currentTarget.select()}
                                            style={{
                                                width: "100%",
                                                fontFamily: "monospace",
                                                fontSize: "11px",
                                                color: "#525252",
                                                background: "white",
                                                border: "1px solid #E5E5E5",
                                                borderRadius: "8px",
                                                padding: "12px",
                                                resize: "none",
                                                wordBreak: "break-all",
                                            }}
                                        />
                                    </div>

                                    <button
                                        onClick={() => {
                                            if (!encryptedNoteBundle) return;
                                            navigator.clipboard.writeText(encryptedNoteBundle);
                                            setCopiedNote(true);
                                            setTimeout(() => setCopiedNote(false), 2000);
                                        }}
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: copiedNote ? "#22c55e" : "#0A0A0A",
                                            color: "white",
                                            fontSize: "14px",
                                            fontWeight: 700,
                                            border: "none",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <Icon
                                            icon={copiedNote ? "ph:check-bold" : "ph:copy-simple-bold"}
                                            style={{ fontSize: "18px" }}
                                        />
                                        {copiedNote ? "Copied!" : "Copy Encrypted Note"}
                                    </button>

                                    <button
                                        onClick={() => setShowQR((prev) => !prev)}
                                        style={{
                                            width: "100%",
                                            padding: "12px",
                                            borderRadius: "12px",
                                            background: "transparent",
                                            color: "#525252",
                                            fontSize: "14px",
                                            fontWeight: 600,
                                            border: "1px solid #E5E5E5",
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            gap: "8px",
                                        }}
                                    >
                                        <Icon icon="ph:qr-code-bold" style={{ fontSize: "18px" }} />
                                        {showQR ? "Hide QR Code" : "Show QR Code"}
                                    </button>

                                    {showQR && encryptedNoteBundle && (
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                gap: "10px",
                                                padding: "16px",
                                                borderRadius: "12px",
                                                border: "1px solid #E5E5E5",
                                                background: "#FAFAFA",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    background: "white",
                                                    padding: "12px",
                                                    borderRadius: "10px",
                                                    border: "1px solid #E5E5E5",
                                                }}
                                            >
                                                <QRCodeSVG value={encryptedNoteBundle} size={180} level="M" />
                                            </div>
                                            <p
                                                style={{
                                                    fontSize: "12px",
                                                    color: "#737373",
                                                    textAlign: "center",
                                                    maxWidth: "260px",
                                                }}
                                            >
                                                Let the creator scan this directly to claim.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    </>
                )}

                <p style={{ textAlign: "center", fontSize: "12px", color: "#A3A3A3" }}>
                    Powered by{" "}
                    <strong style={{ color: "#525252" }}>Growthip</strong> —
                    privacy-preserving tipping on Stellar
                </p>

                <WalletModal
                    show={showWalletModal}
                    onClose={() => setShowWalletModal(false)}
                    onSelectWallet={handleSelectWallet}
                />
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Default export — wraps inner page in <Suspense> because CampaignPageInner
// calls useSearchParams(), which requires a Suspense boundary in Next.js App
// Router to avoid forcing the entire route into client-only rendering.
// ─────────────────────────────────────────────────────────────────────────────

export default function CampaignPage() {
    return (
        <Suspense
            fallback={
                <div
                    style={{
                        minHeight: "100vh",
                        background: "#FAFAFA",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Icon
                        icon="ph:spinner-bold"
                        style={{
                            fontSize: "28px",
                            color: "#A3A3A3",
                            animation: "spin 1s linear infinite",
                        }}
                    />
                </div>
            }
        >
            <CampaignPageInner />
        </Suspense>
    );
}