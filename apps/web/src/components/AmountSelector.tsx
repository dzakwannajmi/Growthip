"use client";

import { useState } from "react";
import type { Token } from "@/lib/tokens";
import { presetToContractAmount } from "@/lib/tokens";

interface AmountSelectorProps {
  token: Token;
  onAmountChange: (contractAmount: number, displayAmount: number) => void;
}

export default function AmountSelector({ token, onAmountChange }: AmountSelectorProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom]     = useState("");
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
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#A3A3A3", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Tip Amount
      </p>

      {/* Preset buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
        {token.presets.map((preset) => {
          const active = selected === preset && !useCustom;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => selectPreset(preset)}
              style={{
                borderRadius: "10px",
                border: active ? "2px solid #0A0A0A" : "1px solid #E5E5E5",
                background: active ? "#0A0A0A" : "white",
                color: active ? "white" : "#525252",
                padding: "10px 4px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {fmtPreset(preset)}
              <span style={{ fontSize: "11px", opacity: 0.7, marginLeft: "2px" }}>{token.symbol}</span>
            </button>
          );
        })}
      </div>

      {/* Custom input */}
      <div style={{ position: "relative" }}>
        <input
          type="number"
          placeholder="Custom amount..."
          value={custom}
          onChange={(e) => { setUseCustom(true); setSelected(null); handleCustom(e.target.value); }}
          min="0"
          step="0.1"
          style={{
            width: "100%", borderRadius: "10px", padding: "10px 52px 10px 14px",
            fontSize: "13px", color: "#0A0A0A", background: "#FAFAFA",
            border: useCustom && custom
              ? isValidCustom ? "1px solid #22c55e" : "1px solid #ef4444"
              : "1px solid #E5E5E5",
            outline: "none",
          }}
        />
        <span style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#A3A3A3", fontWeight: 600 }}>
          {token.symbol}
        </span>
      </div>

      {useCustom && custom && !isValidCustom && (
        <p style={{ fontSize: "12px", color: "#ef4444" }}>
          Must be one of: {token.presets.map((p) => `${fmtPreset(p)} ${token.symbol}`).join(", ")}
        </p>
      )}
      {useCustom && custom && isValidCustom && (
        <p style={{ fontSize: "12px", color: "#22c55e" }}>Valid amount</p>
      )}
    </div>
  );
}