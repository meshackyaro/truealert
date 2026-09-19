"use client";

import type { Hash } from "viem";
import { Card } from "@/components/Shell";
import { txUrl } from "@/config/chains";
import { env } from "@/config/env";
import type { Token } from "@/config/tokens";
import { formatNaira, formatTokenAmount, shortAddress } from "@/lib/format";
import type { LinkPayload } from "@/lib/link";

/** Buyer's confirmation after a successful pay-now payment. */
export function PaidReceipt({ payload, token, hash }: { payload: LinkPayload; token: Token; hash: Hash }) {
  const url = txUrl(env.chain, hash);
  return (
    <Card className="text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100 text-3xl text-green-700">
        ✓
      </div>
      <h2 className="mt-3 text-2xl font-bold">Paid</h2>
      <p className="mt-1 text-neutral-600">
        {formatNaira(payload.details.priceNgn)} ·{" "}
        {formatTokenAmount(payload.terms.amount, token.decimals)} {token.symbol} to{" "}
        {payload.details.sellerName ?? shortAddress(payload.terms.seller)}
      </p>
      <p className="mt-3 text-sm text-neutral-500">
        The seller&apos;s screen confirms this from the blockchain. No screenshot needed.
      </p>
      <p className="mt-3 break-all font-mono text-xs text-neutral-500">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="underline">
            View transaction {shortAddress(hash)}
          </a>
        ) : (
          <>Transaction {hash}</>
        )}
      </p>
    </Card>
  );
}
