import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { hostname: "assets.stellar.org" },
      { hostname: "assets.coingecko.com" },
    ],
  },
};

export default nextConfig;
