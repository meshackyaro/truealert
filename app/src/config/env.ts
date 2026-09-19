import { getAddress, isAddress, type Address } from "viem";
import { chains, type ChainKey } from "./chains";

// NEXT_PUBLIC_* values are inlined at build time, so each must be read with a
// literal `process.env.NAME` expression.

const chainKey = (process.env.NEXT_PUBLIC_CHAIN ?? "testnet") as ChainKey;
if (!(chainKey in chains)) {
  throw new Error(`NEXT_PUBLIC_CHAIN must be local, testnet or mainnet (got "${chainKey}")`);
}

function optionalAddress(name: string, value: string | undefined): Address | undefined {
  if (!value) return undefined;
  if (!isAddress(value)) throw new Error(`${name} is not a valid address: ${value}`);
  return getAddress(value);
}

export const env = {
  chainKey,
  chain: chains[chainKey],
  /** Overrides the chain's default RPC (e.g. a private endpoint). */
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || chains[chainKey].rpcUrls.default.http[0],
  trueAlertAddress: optionalAddress(
    "NEXT_PUBLIC_TRUEALERT_ADDRESS",
    process.env.NEXT_PUBLIC_TRUEALERT_ADDRESS,
  ),
  usdcAddress: optionalAddress("NEXT_PUBLIC_USDC_ADDRESS", process.env.NEXT_PUBLIC_USDC_ADDRESS),
  /** Optional. Without it only browser-injected wallets are offered. */
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined,
} as const;
