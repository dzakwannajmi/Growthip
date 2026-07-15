"use client";

/**
 * currency.ts
 *
 * User's preferred display currency for USD-denominated figures across
 * Dashboard and Analytics. Same pattern as ThemeToggle's dark-mode
 * persistence: a localStorage flag plus a same-tab custom event so every
 * component using useCurrency() re-renders immediately on change,
 * without needing a shared React context or a full page reload.
 */

import { useEffect, useState } from "react";

export type CurrencyCode = "USD" | "IDR";

const STORAGE_KEY = "growthip:currency";
const CURRENCY_CHANGED_EVENT = "growthip:currency-changed";
const DEFAULT_CURRENCY: CurrencyCode = "USD";

export function getCurrency(): CurrencyCode {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "IDR" ? "IDR" : DEFAULT_CURRENCY;
}

export function setCurrency(currency: CurrencyCode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, currency);
  window.dispatchEvent(new Event(CURRENCY_CHANGED_EVENT));
}

/** Live-updating hook: reflects the current preference and re-renders
 * this component whenever ANY component (including itself) calls
 * setCurrency() -- same-tab via a custom event,
 * cross-tab via the native `storage` event. */
export function useCurrency(): [CurrencyCode, (c: CurrencyCode) => void] {
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);

  useEffect(() => {
    setCurrencyState(getCurrency()); // sync after mount (SSR-safe)
    const handler = () => setCurrencyState(getCurrency());
    window.addEventListener(CURRENCY_CHANGED_EVENT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(CURRENCY_CHANGED_EVENT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return [currency, setCurrency];
}

/**
 * Formats an amount that is ALREADY denominated in the target currency
 * (i.e. the caller has already multiplied by the correct usd/idr rate).
 * Does not do any conversion itself -- callers pick prices.xlm.usd vs
 * prices.xlm.idr from usePrices() before calling this.
 */
export function formatMoney(value: number, currency: CurrencyCode): string {
  if (currency === "IDR") {
    return `Rp${value.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
  }
  return `$${value.toFixed(2)}`;
}
