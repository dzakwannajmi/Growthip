"use client";

import { useState } from "react";
import { getAvailableTokens, type Token, type TokenSymbol } from "@/lib/tokens";

interface TokenSelectorProps {
  value: TokenSymbol;
  onChange: (token: Token) => void;
}

export default function TokenSelector({ value, onChange }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const tokens = getAvailableTokens();
  const selected = tokens.find((t) => t.symbol === value) ?? tokens[0];

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
      >
        <div className="flex items-center gap-2">
          <TokenLogo token={selected} />
          <span>{selected.symbol}</span>
          <span className="text-soft-gray/50">— {selected.name}</span>
        </div>
        <svg
          className={`h-4 w-4 text-soft-gray/50 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full z-20 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-midnight-blue shadow-2xl">
          {tokens.map((token) => (
            <button
              key={token.symbol}
              type="button"
              onClick={() => {
                onChange(token);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-sm transition hover:bg-white/[0.06] ${
                token.symbol === value
                  ? "bg-white/[0.04] text-fresh-green"
                  : "text-soft-gray/80"
              }`}
            >
              <TokenLogo token={token} />
              <span className="font-semibold">{token.symbol}</span>
              <span className="text-soft-gray/50">{token.name}</span>
              {token.symbol === value && (
                <svg className="ml-auto h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
          {/* USDC/EURC coming soon if not available */}
          {["USDC", "EURC"].map((symbol) => {
            const available = tokens.some((t) => t.symbol === symbol);
            if (available) return null;
            return (
              <div
                key={symbol}
                className="flex items-center gap-3 px-4 py-3 text-sm text-soft-gray/30"
              >
                <div className="h-6 w-6 rounded-full bg-white/10" />
                <span className="font-semibold">{symbol}</span>
                <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-xs">
                  Coming soon
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TokenLogo({ token }: { token: Token }) {
  return (
    <div className="relative h-6 w-6 overflow-hidden rounded-full bg-white/10">
      <img
        src={token.logoUrl}
        alt={token.symbol}
        width={24}
        height={24}
        className="h-6 w-6 object-cover"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    </div>
  );
}
