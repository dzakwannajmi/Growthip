"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@iconify/react";
import { isConnected, requestAccess } from "@stellar/freighter-api";

const XLM_FRIENDBOT  = "https://friendbot.stellar.org";
const HORIZON_URL    = "https://horizon-testnet.stellar.org";
const USDC_ISSUER    = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

type Status = "idle" | "loading" | "success" | "error";
interface TokenState { status: Status; message: string; txHash?: string; }
interface Balances { xlm: string | null; usdc: string | null; eurc: string | null; }

export default function FaucetPage() {
  const [address, setAddress]     = useState("");
  const [inputAddr, setInputAddr] = useState("");
  const [xlm, setXlm]             = useState<TokenState>({ status: "idle", message: "" });
  const [copied, setCopied]        = useState(false);
  const [balances, setBalances]    = useState<Balances>({ xlm: null, usdc: null, eurc: null });
  const [loadingBal, setLoadingBal] = useState(false);

  const fetchBalances = useCallback(async (addr: string) => {
    if (!addr.trim()) return;
    setLoadingBal(true);
    try {
      const res  = await fetch(`${HORIZON_URL}/accounts/${addr.trim()}`);
      if (!res.ok) { setBalances({ xlm: null, usdc: null, eurc: null }); return; }
      const data = await res.json();
      const bals: Balances = { xlm: null, usdc: null, eurc: null };
      for (const b of data.balances) {
        if (b.asset_type === "native") bals.xlm = parseFloat(b.balance).toFixed(2);
        if (b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER) bals.usdc = parseFloat(b.balance).toFixed(2);
        if (b.asset_code === "EURC") bals.eurc = parseFloat(b.balance).toFixed(2);
      }
      setBalances(bals);
    } catch { setBalances({ xlm: null, usdc: null, eurc: null }); }
    finally { setLoadingBal(false); }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("growthip:wallet");
    if (stored) { setAddress(stored); setInputAddr(stored); fetchBalances(stored); }
    (async () => {
      try {
        const conn = await isConnected();
        if (!conn.isConnected) return;
        const access = await requestAccess();
        if (!access.error) {
          setAddress(access.address);
          setInputAddr(access.address);
          fetchBalances(access.address);
        }
      } catch {}
    })();
  }, [fetchBalances]);

  async function claimXlm() {
    const addr = inputAddr.trim();
    if (!addr) return;
    setXlm({ status: "loading", message: "Requesting XLM from Friendbot..." });
    try {
      const res  = await fetch(`${XLM_FRIENDBOT}?addr=${addr}`);
      const data = await res.json();
      if (data.successful || data._links) {
        setXlm({ status: "success", message: "10,000 XLM added to your wallet!" });
        setTimeout(() => fetchBalances(addr), 3000);
      } else if (JSON.stringify(data).toLowerCase().includes("already")) {
        setXlm({ status: "error", message: "Already funded via Friendbot." });
        fetchBalances(addr);
      } else {
        setXlm({ status: "error", message: data.detail ?? "Failed to claim XLM." });
      }
    } catch {
      setXlm({ status: "error", message: "Network error. Try again." });
    }
  }

  function openUsdcFaucet() {
    navigator.clipboard.writeText(inputAddr.trim()).catch(() => {});
    window.open("https://faucet.circle.com", "_blank");
  }

  function copyAddress() {
    navigator.clipboard.writeText(inputAddr.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleFillWallet() {
    setInputAddr(address);
    fetchBalances(address);
  }

  const xlmFunded  = balances.xlm !== null && parseFloat(balances.xlm) > 0;
  const usdcFunded = balances.usdc !== null;
  const eurcFunded = balances.eurc !== null;

  const tokens = [
    {
      icon: "cryptocurrency-color:xlm",
      name: "XLM",
      label: "Native",
      amount: "10,000 XLM",
      desc: "Required for network fees and tips. Claim once per account.",
      actionLabel: xlm.status === "loading" ? "Funding..." : xlmFunded ? "Funded" : "Fund",
      actionBg: xlm.status === "loading" ? "#E5E5E5" : xlmFunded ? "#F0FDF4" : "#0A0A0A",
      actionColor: xlm.status === "loading" ? "#A3A3A3" : xlmFunded ? "#22c55e" : "white",
      disabled: !inputAddr.trim() || xlm.status === "loading" || xlmFunded,
      onClick: claimXlm,
      balance: balances.xlm,
      balanceLabel: "XLM",
      funded: xlmFunded,
      state: xlm,
    },
    {
      icon: "cryptocurrency-color:usdc",
      name: "USDC",
      label: "Stellar asset",
      amount: "20 USDC",
      desc: "Circle testnet USDC. Opens Circle Faucet — select Stellar and paste your address.",
      actionLabel: usdcFunded ? "Funded" : "Add & Fund",
      actionBg: usdcFunded ? "#F0FDF4" : "#2563EB",
      actionColor: usdcFunded ? "#22c55e" : "white",
      disabled: !inputAddr.trim() || usdcFunded,
      onClick: openUsdcFaucet,
      balance: balances.usdc,
      balanceLabel: "USDC",
      funded: usdcFunded,
      state: null,
    },
    {
      icon: "cryptocurrency-color:eur",
      name: "EURC",
      label: "Stellar asset",
      amount: "Coming Soon",
      desc: "Euro stablecoin by Circle. Not yet available in Growthip.",
      actionLabel: eurcFunded ? "Funded" : "Soon",
      actionBg: "#F5F5F5",
      actionColor: "#A3A3A3",
      disabled: true,
      onClick: () => {},
      balance: balances.eurc,
      balanceLabel: "EURC",
      funded: eurcFunded,
      state: null,
    },
  ];

  return (
    <div style={{ padding: "32px", background: "#FAFAFA", minHeight: "100%" }}>
      <div style={{ maxWidth: "700px", margin: "0 auto", paddingBottom: "80px", display: "flex", flexDirection: "column", gap: "24px" }}>

        {/* Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
            <Icon icon="ph:drop-bold" style={{ fontSize: "24px", color: "#6366f1" }} />
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0A0A0A" }}>Testnet Faucet</h1>
          </div>
          <p style={{ fontSize: "14px", color: "#737373" }}>Fund a testnet account with XLM, USDC, and EURC</p>
        </div>

        {/* Disclaimer */}
        <div style={{ padding: "12px 16px", borderRadius: "12px", background: "#FFF7ED", border: "1px solid #FED7AA", display: "flex", gap: "10px", alignItems: "flex-start" }}>
          <Icon icon="ph:warning-circle-bold" style={{ fontSize: "16px", color: "#F97316", flexShrink: 0, marginTop: "2px" }} />
          <p style={{ fontSize: "12px", color: "#9A3412", lineHeight: 1.6 }}>
            These are <strong>simulated testnet tokens with no monetary value</strong>. Cannot be transferred to mainnet or exchanged for real assets.
          </p>
        </div>

        {/* Address input */}
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.05em" }}>Public key or contract id</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              value={inputAddr}
              onChange={(e) => { setInputAddr(e.target.value); }}
              onBlur={() => { if (inputAddr.trim().length > 10) fetchBalances(inputAddr); }}
              placeholder="Ex: GCEX...Q4UG"
              style={{ flex: 1, padding: "10px 14px", borderRadius: "10px", border: "1px solid #E5E5E5", fontSize: "12px", color: "#0A0A0A", outline: "none", fontFamily: "monospace", background: "#FAFAFA" }}
            />
            {address && (
              <button onClick={handleFillWallet} style={{ padding: "10px 12px", borderRadius: "10px", background: "#F5F5F5", border: "1px solid #E5E5E5", fontSize: "12px", fontWeight: 700, color: "#525252", cursor: "pointer", whiteSpace: "nowrap" }}>
                Fill with wallet
              </button>
            )}
            <button onClick={copyAddress} disabled={!inputAddr.trim()} style={{ padding: "10px 12px", borderRadius: "10px", background: copied ? "#F0FDF4" : "#F5F5F5", border: `1px solid ${copied ? "#BBF7D0" : "#E5E5E5"}`, fontSize: "12px", fontWeight: 700, color: copied ? "#22c55e" : "#525252", cursor: "pointer" }}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {/* Token cards */}
        <div style={{ background: "white", borderRadius: "16px", border: "1px solid #E5E5E5", padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.05em" }}>Choose asset to fund</p>
            {loadingBal && <Icon icon="ph:spinner-bold" style={{ fontSize: "14px", color: "#A3A3A3", animation: "spin 1s linear infinite" }} />}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            {tokens.map((token) => (
              <div key={token.name} style={{ borderRadius: "14px", border: `1px solid ${token.funded ? "#BBF7D0" : "#E5E5E5"}`, padding: "16px", display: "flex", flexDirection: "column", gap: "10px", background: token.name === "EURC" ? "#FAFAFA" : "white", opacity: token.name === "EURC" && !token.funded ? 0.5 : 1 }}>
                {/* Token icon + amount */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Icon icon={token.icon} style={{ fontSize: "32px" }} />
                  <div>
                    <p style={{ fontSize: "10px", color: "#A3A3A3", fontWeight: 600 }}>{token.label}</p>
                    <p style={{ fontSize: "15px", fontWeight: 800, color: "#0A0A0A" }}>{token.amount}</p>
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: "11px", color: "#737373", lineHeight: 1.5, flex: 1 }}>{token.desc}</p>

                {/* Balance */}
                <div style={{ padding: "8px 10px", borderRadius: "8px", background: token.funded ? "#F0FDF4" : "#F5F5F5", border: `1px solid ${token.funded ? "#BBF7D0" : "#E5E5E5"}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "11px", color: "#737373", fontWeight: 600 }}>Balance</span>
                  <span style={{ fontSize: "12px", fontWeight: 800, color: token.funded ? "#22c55e" : "#A3A3A3" }}>
                    {loadingBal ? "..." : token.balance !== null ? `${token.balance} ${token.balanceLabel}` : "—"}
                  </span>
                </div>

                {/* Fund button */}
                <button
                  onClick={token.onClick}
                  disabled={token.disabled}
                  style={{ width: "100%", padding: "9px", borderRadius: "10px", background: token.disabled ? token.actionBg : token.actionBg, color: token.actionColor, fontSize: "13px", fontWeight: 700, border: "none", cursor: token.disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}
                >
                  {token.funded && <Icon icon="ph:check-bold" style={{ fontSize: "13px" }} />}
                  {token.actionLabel}
                </button>

                {/* XLM status message */}
                {token.state && token.state.status !== "idle" && (
                  <div style={{ padding: "8px 10px", borderRadius: "8px", background: token.state.status === "success" ? "#F0FDF4" : token.state.status === "error" ? "#FEF2F2" : "#F5F5F5", fontSize: "11px", color: token.state.status === "success" ? "#15803D" : token.state.status === "error" ? "#B91C1C" : "#525252", lineHeight: 1.5 }}>
                    {token.state.message}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p style={{ fontSize: "12px", color: "#737373", lineHeight: 1.6 }}>
            A trustline lets your account hold and receive an asset. Your address must have XLM to submit the transaction.{" "}
            <a href="https://developers.stellar.org/docs/learn/fundamentals/stellar-data-structures/accounts#trustlines" target="_blank" rel="noreferrer" style={{ color: "#6366f1", textDecoration: "none", fontWeight: 600 }}>
              What is a trustline? →
            </a>
          </p>
        </div>

        {/* Stellar Expert link */}
        {inputAddr.trim() && (
          <div style={{ textAlign: "center" }}>
            <a href={`https://stellar.expert/explorer/testnet/account/${inputAddr.trim()}`} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: "#6366f1", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Icon icon="ph:arrow-square-out-bold" style={{ fontSize: "14px" }} />
              View account on Stellar Expert
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
