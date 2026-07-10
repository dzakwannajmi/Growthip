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
        className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] text-[#0A0A0A] dark:text-[#E5E5E5]"
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          gap: "12px", borderRadius: "12px",
          padding: "12px 16px", fontSize: "14px",
          fontWeight: 600, cursor: "pointer",
          transition: "background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Icon icon={TOKEN_ICONS[selected.symbol] || "ph:coin-bold"} style={{ fontSize: "24px" }} />
          <span style={{ fontWeight: 700 }}>{selected.symbol}</span>
          <span className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontWeight: 500 }}>— {selected.name}</span>
        </div>
        <Icon
          icon="ph:caret-down-bold"
          className="text-[#A3A3A3] dark:text-[#6A6A6A]"
          style={{ fontSize: "16px", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0,
            zIndex: 50, borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          {tokens.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => { onChange(token); setOpen(false); }}
              className={[
                token.symbol === value ? "bg-[#F5F5F5] dark:bg-[#2A2A2A] text-[#0A0A0A] dark:text-[#F5F5F5]" : "bg-white dark:bg-[#1A1A1A] text-[#525252] dark:text-[#B0B0B0]",
                "border-b border-[#F5F5F5] dark:border-[#232323] hover:bg-[#F5F5F5] dark:hover:bg-[#2A2A2A]",
              ].join(" ")}
              style={{
                display: "flex", width: "100%", alignItems: "center", gap: "12px",
                padding: "12px 16px", fontSize: "14px", fontWeight: 600,
                border: "none", cursor: "pointer", textAlign: "left",
                transition: "background 0.15s",
              }}
            >
              <Icon icon={TOKEN_ICONS[token.symbol] || "ph:coin-bold"} style={{ fontSize: "24px" }} />
              <span style={{ fontWeight: 700 }}>{token.symbol}</span>
              <span className="text-[#A3A3A3] dark:text-[#6A6A6A]" style={{ fontWeight: 500 }}>{token.name}</span>
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