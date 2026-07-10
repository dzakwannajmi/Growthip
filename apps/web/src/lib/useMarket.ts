"use client";

import { useEffect, useState, useCallback } from "react";

// ── Price hook (CoinGecko free, no API key) ─────────────────────────────
interface Prices {
  xlm:  { usd: number; idr: number; usd_24h_change: number };
  usdc: { usd: number; idr: number; usd_24h_change: number };
}

export function usePrices() {
  const [prices, setPrices] = useState<Prices>({
    xlm:  { usd: 0, idr: 0, usd_24h_change: 0 },
    usdc: { usd: 1, idr: 0, usd_24h_change: 0 },
  });
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=stellar%2Cusd-coin&vs_currencies=usd%2Cidr&include_24hr_change=true",
        { next: { revalidate: 30 } }
      );
      if (!res.ok) return;
      const data = await res.json();
      setPrices({
        xlm: {
          usd:            data.stellar?.["usd"]            ?? 0,
          idr:            data.stellar?.["idr"]             ?? 0,
          usd_24h_change: data.stellar?.["usd_24h_change"] ?? 0,
        },
        usdc: {
          usd:            data["usd-coin"]?.["usd"]            ?? 1,
          idr:            data["usd-coin"]?.["idr"]             ?? 0,
          usd_24h_change: data["usd-coin"]?.["usd_24h_change"] ?? 0,
        },
      });
    } catch {
      // Silent fail — keep last price
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 30_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { prices, loading };
}

// ── Balance hook (Stellar Horizon testnet) ──────────────────────────────
interface Balances {
  xlm:  number;
  usdc: number;
  eurc: number;
}

const HORIZON = "https://horizon-testnet.stellar.org";
const USDC_ISSUER = process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GCOLSMDNCJLAFKEZ3QWKPYK74DCJO25WNHX6TTSSXO6E7BNKT26WEZRR";

export function useWalletBalances(address: string) {
  const [balances, setBalances] = useState<Balances>({ xlm: 0, usdc: 0, eurc: 0 });
  const [loading, setLoading]   = useState(false);

  const fetch_ = useCallback(async () => {
    if (!address) {
      setBalances({ xlm: 0, usdc: 0, eurc: 0 });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${HORIZON}/accounts/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      const raw: { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }[] =
        data.balances ?? [];

      let xlm  = 0;
      let usdc = 0;
      let eurc = 0;

      for (const b of raw) {
        if (b.asset_type === "native") {
          xlm = parseFloat(b.balance);
        } else if (b.asset_code === "USDC") {
          usdc = parseFloat(b.balance);
        } else if (b.asset_code === "EURC") {
          eurc = parseFloat(b.balance);
        }
      }

      setBalances({ xlm, usdc, eurc });
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, 15_000);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { balances, loading, refetch: fetch_ };
}
