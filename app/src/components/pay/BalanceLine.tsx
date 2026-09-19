"use client";

import { useAccount } from "wagmi";
import type { Token } from "@/config/tokens";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { formatTokenAmount } from "@/lib/format";

/** "Your balance: 5,000 USDC", with a warning when it's short of `needed`. */
export function BalanceLine({ token, needed }: { token: Token; needed: bigint }) {
  const { address } = useAccount();
  const { value } = useTokenBalance(token, address);
  if (value === undefined) return null;
  const short = value < needed;
  return (
    <p className={`px-1 text-sm ${short ? "text-red-700" : "text-neutral-600"}`}>
      Your balance: {formatTokenAmount(value, token.decimals)} {token.symbol}
      {short && " (not enough for this payment)"}
    </p>
  );
}
