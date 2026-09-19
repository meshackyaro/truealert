"use client";

import { useQuery } from "@tanstack/react-query";
import type { RateQuote } from "@/lib/server/rates";

/** Live naira rate from /api/rate, refreshed every minute. */
export function useRate() {
  return useQuery({
    queryKey: ["rate"],
    queryFn: async (): Promise<RateQuote> => {
      const res = await fetch("/api/rate");
      if (!res.ok) throw new Error("Exchange rate unavailable");
      return res.json();
    },
    refetchInterval: 60_000,
    retry: 2,
  });
}
