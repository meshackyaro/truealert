import { getAddress, zeroAddress, type Address } from "viem";
import { env } from "./env";

export type Token = {
  address: Address; // zeroAddress = native ETN
  symbol: string;
  name: string;
  decimals: number;
  native: boolean;
};

export const ETN: Token = {
  address: zeroAddress,
  symbol: "ETN",
  name: "Electroneum",
  decimals: 18,
  native: true,
};

/**
 * Tokens the app will display and pay with. This list is the ONLY source of
 * token names/symbols: on-chain metadata is never rendered, because anyone can
 * deploy a token called "USDT Official ✅ VERIFIED" (Electroneum testnet has
 * several, some with HTML injection in the name).
 */
export function supportedTokens(): Token[] {
  const tokens = [ETN];
  if (env.usdcAddress) {
    tokens.push({
      address: env.usdcAddress,
      symbol: "USDC",
      name: env.chainKey === "mainnet" ? "USD Coin" : "USD Coin (test)",
      decimals: 6,
      native: false,
    });
  }
  return tokens;
}

/** Returns the supported token at `address`, or undefined if it isn't one. */
export function findToken(address: string, tokens: Token[] = supportedTokens()): Token | undefined {
  let normalized: Address;
  try {
    normalized = getAddress(address);
  } catch {
    return undefined;
  }
  return tokens.find((t) => t.address === normalized);
}
