"use client";

import { useBlock } from "wagmi";
import { useNow } from "./useNow";

/**
 * "Now" for deadline logic: the later of the device clock and the latest
 * block's timestamp. The contract judges deadlines by block time, so when the
 * chain is ahead of the device (a slow phone clock, or a fast-forwarded test
 * chain) we follow the chain. Blocks otherwise track wall-clock time closely.
 */
export function useChainNow(): number | undefined {
  const wall = useNow();
  const { data: block } = useBlock({ query: { refetchInterval: 5_000 } });
  if (wall === undefined) return undefined;
  const chain = block ? Number(block.timestamp) : 0;
  return Math.max(wall, chain);
}
