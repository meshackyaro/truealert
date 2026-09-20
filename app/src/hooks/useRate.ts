"use client";

import { useQuery } from "@tanstack/react-query";
import type { RateQuote } from "@/lib/server/rates";

/**
 * Live naira rate, refreshed every minute.
 *
 * `initialRate` is the quote rendered on the server, so the first paint
 * already has a price and the seller isn't waiting on a round trip. Calling
 * this hook more than once shares one query.
 */
export function useRate(initialRate?: RateQuote) {
  return useQuery({
    queryKey: ["rate"],
    queryFn: async (): Promise<RateQuote> => {
      const res = await fetch("/api/rate");
      if (!res.ok) throw new Error("Exchange rate unavailable");
      return res.json();
    },
    initialData: initialRate,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 2,
  });
}
