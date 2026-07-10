"use client";

/**
 * EarningsAreaChart.tsx
 *
 * Per-token earnings over time, converted to the user's selected display
 * currency (USD/IDR). Built directly on recharts (no shadcn/ui chart
 * wrapper -- this codebase doesn't use shadcn), with its own independent
 * date-range selector (7d/30d/90d), matching the interactive area-chart
 * pattern Najmi referenced, adapted to Growthip's existing card/dropdown
 * styling instead of copying shadcn markup verbatim.
 *
 * Automatically plots one <Area> per entry in `availableTokens` -- no
 * code change needed when EURC/IDRT go live later, same "future-proof"
 * approach used for the "Combined value across ..." label elsewhere in
 * Analytics.
 */

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Icon } from "@iconify/react";
import { useIsDarkMode } from "@/hooks/useIsDarkMode";
import { getToken, type Token } from "@/lib/tokens";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import type { PrivateNote } from "@/lib/note";

type Range = "7d" | "30d" | "90d";

const RANGE_DAYS: Record<Range, number> = { "7d": 7, "30d": 30, "90d": 90 };
const RANGE_LABELS: Record<Range, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days" };

const TOKEN_COLORS: Record<string, string> = {
  XLM: "#00B2FF",
  USDC: "#22c55e",
  EURC: "#f59e0b",
  IDRT: "#ef4444",
};
const FALLBACK_COLOR = "#6366f1";

interface EarningsAreaChartProps {
  notes: PrivateNote[]; // combined claimed + pending
  currency: CurrencyCode;
  rateFor: (tokenSymbol: string) => number;
  availableTokens: Token[];
}

export default function EarningsAreaChart({ notes, currency, rateFor, availableTokens }: EarningsAreaChartProps) {
  const [range, setRange] = useState<Range>("30d");
  const [showDropdown, setShowDropdown] = useState(false);
  const isDark = useIsDarkMode();

  const days = RANGE_DAYS[range];
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // One row per day, oldest first -- each row carries a converted-value
  // sum per token symbol for that day.
  const data = Array.from({ length: days }, (_, idx) => {
    const dayStart = now - (days - 1 - idx) * dayMs;
    const label = new Date(dayStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const row: Record<string, string | number> = { date: label };
    for (const token of availableTokens) row[token.symbol] = 0;
    return row;
  });

  for (const n of notes) {
    const daysAgo = Math.floor((now - n.timestamp) / dayMs);
    if (daysAgo < 0 || daysAgo >= days) continue;
    const rowIndex = days - 1 - daysAgo;
    const token = getToken(n.token);
    if (!token) continue;
    const human = Number(n.amount) / Math.pow(10, token.decimals);
    const converted = human * rateFor(n.token);
    const current = data[rowIndex][n.token];
    data[rowIndex][n.token] = (typeof current === "number" ? current : 0) + converted;
  }

  const gridColor = isDark ? "#2A2A2A" : "#F0F0F0";
  const axisColor = isDark ? "#6A6A6A" : "#A3A3A3";
  const tooltipBg = isDark ? "#1A1A1A" : "#FFFFFF";
  const tooltipBorder = isDark ? "#2A2A2A" : "#E5E5E5";
  const tooltipText = isDark ? "#F5F5F5" : "#0A0A0A";

  return (
    <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A] rounded-2xl p-5">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Icon icon="ph:chart-line-bold" style={{ fontSize: "18px", color: "#f59e0b" }} />
          <p className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px", fontWeight: 700 }}>Earnings Over Time</p>
        </div>

        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowDropdown((p) => !p)}
            className="bg-[#F5F5F5] dark:bg-[#1E1E1E] text-[#171717] dark:text-[#E5E5E5]"
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, border: "none", cursor: "pointer" }}
          >
            {RANGE_LABELS[range]}
            <Icon icon="ph:caret-down-bold" style={{ fontSize: "11px", opacity: 0.6 }} />
          </button>
          {showDropdown && (
            <div className="bg-white dark:bg-[#1A1A1A] border border-[#E5E5E5] dark:border-[#2A2A2A]" style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, borderRadius: "14px", boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 50, minWidth: "160px", padding: "6px" }}>
              {(["7d", "30d", "90d"] as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); setShowDropdown(false); }}
                  className={["text-[#171717] dark:text-[#E5E5E5]", range === r ? "bg-[#F5F5F5] dark:bg-[#2A2A2A]" : "bg-transparent"].join(" ")}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderRadius: "10px", fontSize: "13px", fontWeight: range === r ? 700 : 500, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                >
                  {RANGE_LABELS[r]}
                  {range === r && <Icon icon="ph:check-bold" className="text-[#0A0A0A] dark:text-[#F5F5F5]" style={{ fontSize: "14px" }} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {availableTokens.map((token) => {
                const color = TOKEN_COLORS[token.symbol] ?? FALLBACK_COLOR;
                return (
                  <linearGradient key={token.symbol} id={`fill-${token.symbol}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                );
              })}
            </defs>
            <CartesianGrid vertical={false} stroke={gridColor} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tick={{ fill: axisColor, fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: axisColor, fontSize: 11 }} tickFormatter={(v: number) => formatMoney(v, currency)} width={currency === "IDR" ? 70 : 50} />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: "10px", fontSize: "12px" }}
              labelStyle={{ color: tooltipText, fontWeight: 700, marginBottom: "4px" }}
              formatter={(value, name) => [formatMoney(Number(value) || 0, currency), String(name)]}
            />
            <Legend wrapperStyle={{ fontSize: "12px", color: axisColor }} />
            {availableTokens.map((token) => {
              const color = TOKEN_COLORS[token.symbol] ?? FALLBACK_COLOR;
              return (
                <Area
                  key={token.symbol}
                  dataKey={token.symbol}
                  type="monotone"
                  fill={`url(#fill-${token.symbol})`}
                  stroke={color}
                  strokeWidth={2}
                  stackId="earnings"
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
