"use client";

import { erc20Abi, type Address } from "viem";
import { useBalance, useReadContract } from "wagmi";
import type { Token } from "@/config/tokens";

/** Balance of `token` (native ETN or ERC-20) for `owner`, refreshed every few seconds. */
export function useTokenBalance(token: Token, owner: Address | undefined) {
  const native = useBalance({
    address: owner,
    query: { enabled: !!owner && token.native, refetchInterval: 5_000 },
  });
  const erc20 = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner && !token.native, refetchInterval: 5_000 },
  });
  const result = token.native ? native : erc20;
  const value = token.native ? native.data?.value : erc20.data;
  return { value, isLoading: result.isLoading, refetch: result.refetch };
}

/** Native ETN balance, needed for network fees whatever the payment token. */
export function useGasBalance(owner: Address | undefined) {
  const { data } = useBalance({
    address: owner,
    query: { enabled: !!owner, refetchInterval: 10_000 },
  });
  return data?.value;
}
