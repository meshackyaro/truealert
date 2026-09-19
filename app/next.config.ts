import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      // Optional peers of @coinbase/cdp-sdk (via wagmi's Base Account
      // connector) that we don't install. See src/stubs/x402.cjs.
      "@x402/*": "./src/stubs/x402.cjs",
    },
  },
};

export default nextConfig;
