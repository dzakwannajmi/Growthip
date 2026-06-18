"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";

interface TokenSelectorProps {
  value: TokenSymbol;
  onChange: (token: Token) => void;
}

const TOKEN_ICONS: Record<string, string> = {
  XLM:  "cryptocurrency-color:xlm",
  USDC: "cryptocurrency-color:usdc",
  EURC: "cryptocurrency-color:eur",
};

export default function TokenSelector({ value, onChange }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const tokens   = getAvailableTokens();
  const selected = tokens.find((t) => t.symbol === value) ?? tokens[0];

  return (
    <div style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          gap: "12px", borderRadius: "12px", border: "1px solid #E5E5E5",
          background: "white", padding: "12px 16px", fontSize: "14px",
          fontWeight: 600, color: "#0A0A0A", cursor: "pointer",
          transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Icon icon={TOKEN_ICONS[selected.symbol] || "ph:coin-bold"} style={{ fontSize: "24px" }} />
          <span style={{ fontWeight: 700 }}>{selected.symbol}</span>
          <span style={{ color: "#A3A3A3", fontWeight: 500 }}>— {selected.name}</span>
        </div>
        <Icon
          icon="ph:caret-down-bold"
          style={{ fontSize: "16px", color: "#A3A3A3", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
          zIndex: 50, borderRadius: "12px", border: "1px solid #E5E5E5",
          background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
          overflow: "hidden",
        }}>
          {tokens.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => { onChange(token); setOpen(false); }}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: "12px",
                padding: "12px 16px", fontSize: "14px", fontWeight: 600,
                background: token.symbol === value ? "#F5F5F5" : "white",
                color: token.symbol === value ? "#0A0A0A" : "#525252",
                border: "none", cursor: "pointer", textAlign: "left",
                borderBottom: "1px solid #F5F5F5",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#F5F5F5"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = token.symbol === value ? "#F5F5F5" : "white"; }}
            >
              <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "24px" }} />
              <span style={{ fontWeight: 700 }}>{token.symbol}</span>
              <span style={{ color: "#A3A3A3", fontWeight: 500 }}>{token.name}</span>
              {token.symbol === value && (
                <Icon icon="ph:check-bold" style={{ marginLeft: "auto", fontSize: "14px", color: "#22c55e" }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}