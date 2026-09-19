import { defineChain, type Chain } from "viem";
import { electroneum, foundry } from "viem/chains";

/**
 * Electroneum testnet. Defined here rather than taken from `viem/chains`,
 * whose entry points at a dead RPC (testnet-rpc.electroneum.com) and an
 * unofficial explorer.
 */
export const electroneumTestnet = defineChain({
  id: 5_201_420,
  name: "Electroneum Testnet",
  nativeCurrency: { name: "ETN", symbol: "ETN", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.ankr.com/electroneum_testnet"] },
  },
  blockExplorers: {
    default: {
      name: "Electroneum Testnet Explorer",
      url: "https://testnet-blockexplorer.electroneum.com",
    },
  },
  testnet: true,
});

export const electroneumMainnet = electroneum;

/** Local anvil chain for development (chain ID 31337). */
export const localChain = foundry;

export type ChainKey = "local" | "testnet" | "mainnet";

export const chains: Record<ChainKey, Chain> = {
  local: localChain,
  testnet: electroneumTestnet,
  mainnet: electroneumMainnet,
};

export const faucetUrl = "https://faucet.electroneum.com";
