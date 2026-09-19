"use client";

import { zeroAddress } from "viem";
import { Card } from "@/components/Shell";
import { env } from "@/config/env";
import type { Token } from "@/config/tokens";
import {
  formatClock,
  formatDuration,
  formatNaira,
  formatTimeLeft,
  formatTokenAmount,
  shortAddress,
} from "@/lib/format";
import type { LinkPayload } from "@/lib/link";
import { Mode } from "@/lib/terms";

type Props = {
  payload: LinkPayload;
  token: Token;
  now: number | undefined;
  showExpiry: boolean;
};

/** The invoice as the seller signed it: item, naira price, amount, terms. */
export function InvoiceCard({ payload, token, now, showExpiry }: Props) {
  const { terms, details } = payload;
  const isProtected = terms.mode === Mode.Protected;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-neutral-500">
            {details.sellerName ?? "Seller"} · {shortAddress(terms.seller)}
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold">{details.item}</h1>
        </div>
        <ModeBadge isProtected={isProtected} />
      </div>

      <p className="mt-4 text-4xl font-bold tracking-tight">{formatNaira(details.priceNgn)}</p>
      <p className="mt-1 text-neutral-600">
        You pay{" "}
        <span className="font-semibold text-neutral-900">
          {formatTokenAmount(terms.amount, token.decimals)} {token.symbol}
        </span>
      </p>
      {details.rate && (
        <p className="mt-1 text-xs text-neutral-500">
          Rate ₦{Number(details.rate.ngnPerUsd).toLocaleString("en-NG")}/$ ·{" "}
          {details.rate.source === "quidax" ? "Quidax" : "Official rate (daily)"} ·{" "}
          {formatClock(details.rate.at)}
        </p>
      )}

      {details.note && (
        <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
          {details.note}
        </p>
      )}

      {isProtected && <ProtectedTerms payload={payload} />}

      {showExpiry && now !== undefined && (
        <p className="mt-4 text-xs text-neutral-500">
          {now > Number(terms.expiry)
            ? "Link expired"
            : `Price locked · ${formatTimeLeft(terms.expiry, now)}`}
        </p>
      )}
    </Card>
  );
}

function ModeBadge({ isProtected }: { isProtected: boolean }) {
  return isProtected ? (
    <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
      🛡 Protected
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">
      Pay now
    </span>
  );
}

function ProtectedTerms({ payload }: { payload: LinkPayload }) {
  const { terms } = payload;
  const arbiterKnown =
    terms.arbiter !== zeroAddress && terms.arbiter.toLowerCase() === env.arbiterAddress?.toLowerCase();
  return (
    <div className="mt-4 space-y-2 rounded-xl bg-green-50/60 p-3 text-sm text-neutral-700 ring-1 ring-green-100">
      <p className="font-medium text-green-900">Your money is held safely until delivery</p>
      <ul className="space-y-1">
        <li>• Seller has {formatDuration(terms.shipWindow)} to ship, or you can take your money back.</li>
        <li>
          • After shipping you have {formatDuration(terms.confirmWindow)} to confirm or raise a problem
          (you can extend once, up to 48 hours).
        </li>
        <li>
          •{" "}
          {terms.arbiter === zeroAddress ? (
            "No referee: this order can't be disputed."
          ) : arbiterKnown ? (
            "Disputes go to TrueAlert Resolution."
          ) : (
            <span className="font-medium text-amber-800">
              Disputes go to an unrecognised referee ({shortAddress(terms.arbiter)}). Only pay if you
              trust them.
            </span>
          )}
        </li>
      </ul>
    </div>
  );
}
