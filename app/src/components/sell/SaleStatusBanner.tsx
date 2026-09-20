"use client";

import { useEffect } from "react";
import { txUrl } from "@/config/chains";
import { env } from "@/config/env";
import { findToken } from "@/config/tokens";
import type { CreatedSale } from "@/hooks/useCreateSale";
import type { SaleStatus } from "@/hooks/useSaleStatus";
import { formatNaira, formatTokenAmount, shortAddress } from "@/lib/format";

/** Live status on the seller's screen: waiting → PAID ✓ (read from the chain). */
export function SaleStatusBanner({ sale, status }: { sale: CreatedSale; status: SaleStatus }) {
  const { terms, details } = sale.payload;
  const token = findToken(terms.token);

  // A short buzz on phones when the money lands.
  const done = status.kind !== "waiting";
  useEffect(() => {
    if (done && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([80, 40, 80]);
  }, [done]);

  if (status.kind === "waiting") {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-muted" role="status">
        <span className="size-2 animate-pulse rounded-full bg-warning" aria-hidden />
        Waiting for payment… this updates by itself
      </p>
    );
  }

  const amount = token ? `${formatTokenAmount(terms.amount, token.decimals)} ${token.symbol}` : "";

  if (status.kind === "funded") {
    return (
      <div className="rounded-2xl bg-brand p-4 text-on-brand" role="status">
        <p className="text-2xl font-bold">Buyer paid ✓</p>
        <p className="text-sm opacity-90">
          {formatNaira(details.priceNgn)} · {amount} is held safely for you. Ship the order, then mark it
          shipped.
        </p>
        <a href={sale.url} className="mt-3 inline-block rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-success">
          Manage this order
        </a>
      </div>
    );
  }

  const url = status.txHash ? txUrl(env.chain, status.txHash) : undefined;
  return (
    <div className="rounded-2xl bg-brand p-5 text-on-brand" role="status">
      <p className="text-4xl font-bold">PAID ✓</p>
      <p className="mt-1 text-lg font-semibold">
        {formatNaira(details.priceNgn)} · {amount}
      </p>
      <p className="mt-1 text-sm opacity-90">
        Confirmed on the blockchain{status.buyer ? ` from ${shortAddress(status.buyer)}` : ""}. It&apos;s in your
        wallet now.
      </p>
      {url && (
        <a href={url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">
          View transaction
        </a>
      )}
    </div>
  );
}
