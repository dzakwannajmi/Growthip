"use client";

import { useState } from "react";
import type { Token } from "@/lib/tokens";
import { presetToContractAmount } from "@/lib/tokens";

interface AmountSelectorProps {
  token: Token;
  onAmountChange: (contractAmount: number, displayAmount: number) => void;
}

export default function AmountSelector({ token, onAmountChange }: AmountSelectorProps) {
  const [selected, setSelected]   = useState<number | null>(null);
  const [custom, setCustom]       = useState("");
  const [useCustom, setUseCustom] = useState(false);

  function selectPreset(preset: number) {
    setUseCustom(false);
    setSelected(preset);
    setCustom("");
    onAmountChange(presetToContractAmount(preset, token), preset);
  }

  function handleCustom(val: string) {
    setCustom(val);
    setSelected(null);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      onAmountChange(presetToContractAmount(num, token), num);
    }
  }

  const fmtPreset = (p: number) => p % 1 === 0 ? String(p) : p.toFixed(1);

  const isValidCustom = (() => {
    const num = parseFloat(custom);
    if (isNaN(num) || num <= 0) return false;
    return token.presets.some((p) => Math.abs(num - p) < 0.0001);
  })();

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-soft-gray/45">
        Tip Amount
      </p>

      <div className="grid grid-cols-4 gap-2">
        {token.presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => selectPreset(preset)}
            className={
              "rounded-2xl border py-3 text-sm font-bold transition " +
              (selected === preset && !useCustom
                ? "border-fresh-green bg-fresh-green/10 text-fresh-green"
                : "border-white/10 bg-white/[0.04] text-soft-gray/70 hover:border-white/20 hover:text-white")
            }
          >
            {fmtPreset(preset)}
            <span className="ml-1 text-xs opacity-60">{token.symbol}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <input
          type="number"
          placeholder="Custom amount..."
          value={custom}
          onChange={(e) => { setUseCustom(true); setSelected(null); handleCustom(e.target.value); }}
          min="0"
          step="0.1"
          className={
            "w-full rounded-2xl border bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition " +
            (useCustom && custom
              ? isValidCustom
                ? "border-fresh-green/50"
                : "border-coral-red/50"
              : "border-white/10 focus:border-neon-violet/50")
          }
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-soft-gray/50">
          {token.symbol}
        </span>
      </div>

      {useCustom && custom && (
        isValidCustom
          ? <p className="text-xs text-fresh-green">Valid amount selected</p>
          : <p className="text-xs text-coral-red">
              Must be one of: {token.presets.map((p) => `${fmtPreset(p)} ${token.symbol}`).join(", ")}
            </p>
      )}
    </div>
  );
}