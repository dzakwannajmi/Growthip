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
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "assets.stellar.org" },
      { hostname: "assets.coingecko.com" },
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
};

export default nextConfig;