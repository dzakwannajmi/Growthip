import type { NextConfig } from "next";

/**
 * Next.js 16 + Turbopack.
 *
 * snarkjs references Node core modules (fs, readline, etc.) that don't exist in
 * the browser. Turbopack does NOT support webpack's `resolve.fallback`; instead
 * we alias those modules to an empty stub for the browser build.
 * See: https://nextjs.org/docs/app/guides/upgrading/version-16
 *
 * Create apps/web/src/lib/empty.ts containing: `export default {};`
 */

/**
 * Content-Security-Policy -- "strong baseline" tier (see SECURITY.md for
 * the full writeup of why this isn't the stricter nonce-based variant).
 *
 * script-src allows 'unsafe-inline' because Next.js injects small inline
 * hydration scripts (`self.__next_f.push(...)`) by default; blocking
 * those without a nonce-based setup (which requires middleware + forcing
 * dynamic rendering on every page) would break hydration entirely. This
 * still blocks the most common XSS payload shape -- loading a <script>
 * from an attacker-controlled domain -- since script-src is restricted
 * to 'self' otherwise. A nonce-based, zero-unsafe-inline CSP is tracked
 * as a Phase 4 (Production Hardening) roadmap item, not silently dropped.
 *
 * connect-src is scoped to exactly the external services this app talks
 * to: Stellar Horizon/Soroban RPC (testnet), CoinGecko (price feed), and
 * the Dicebear avatar API (fetched as <img>, but some browsers still
 * gate it under connect-src for prefetching -- included defensively).
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://assets.stellar.org https://assets.coingecko.com https://api.dicebear.com",
  "font-src 'self' data:",
  "connect-src 'self' https://soroban-testnet.stellar.org https://horizon-testnet.stellar.org https://api.coingecko.com https://api.dicebear.com https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://friendbot.stellar.org https://friendbot-testnet.circle.com",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "assets.stellar.org" },
      { hostname: "assets.coingecko.com" },
      { hostname: "api.dicebear.com" },
    ],
  },
  turbopack: {
    resolveAlias: {
      fs: { browser: "./src/lib/empty.ts" },
      path: { browser: "./src/lib/empty.ts" },
      crypto: { browser: "./src/lib/empty.ts" },
      os: { browser: "./src/lib/empty.ts" },
      readline: { browser: "./src/lib/empty.ts" },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;