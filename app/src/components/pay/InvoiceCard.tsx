"use client";

import { zeroAddress } from "viem";
import { Badge, Card } from "@/components/Shell";
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
import { koboToNaira, lineItemsTotalKobo, Mode, type LineItem } from "@/lib/terms";

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
          <p className="truncate text-sm text-muted">
            {details.sellerName ?? "Seller"} · {shortAddress(terms.seller)}
          </p>
          <h1 className="mt-1 break-words text-xl font-semibold">{details.item}</h1>
        </div>
        <ModeBadge isProtected={isProtected} />
      </div>

      <p className="mt-4 text-display font-bold tabular-nums">{formatNaira(details.priceNgn)}</p>
      <p className="mt-1 text-muted">
        You pay{" "}
        <span className="font-semibold text-fg tabular-nums">
          {formatTokenAmount(terms.amount, token.decimals)} {token.symbol}
        </span>
      </p>
      {details.rate && (
        <p className="mt-1 text-xs text-muted">
          Rate ₦{Number(details.rate.ngnPerUsd).toLocaleString("en-NG")}/$ ·{" "}
          {details.rate.source === "quidax" ? "Quidax" : "Official rate (daily)"} ·{" "}
          {formatClock(details.rate.at)}
        </p>
      )}

      {details.items && details.items.length > 1 && <Breakdown items={details.items} />}

      {details.note && (
        <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-surface-muted p-3 text-sm text-fg">
          {details.note}
        </p>
      )}

      {isProtected && <ProtectedTerms payload={payload} />}

      {showExpiry && now !== undefined && (
        <p className="mt-4 text-xs text-muted">
          {now > Number(terms.expiry)
            ? "Link expired"
            : `Price locked · ${formatTimeLeft(terms.expiry, now)}`}
        </p>
      )}
    </Card>
  );
}

/** What the total is made of. The link is rejected if these don't add up. */
function Breakdown({ items }: { items: LineItem[] }) {
  return (
    <ul className="mt-4 divide-y divide-border rounded-xl bg-surface-muted px-3 text-sm ring-1 ring-border">
      {items.map((line, i) => {
        const kobo = lineItemsTotalKobo([line]);
        return (
          <li key={`${line.name}-${i}`} className="flex items-baseline justify-between gap-3 py-2.5">
            <span className="min-w-0 break-words">
              {line.qty > 1 && <span className="text-muted">{line.qty} × </span>}
              {line.name}
            </span>
            <span className="shrink-0 tabular-nums">{kobo === null ? "—" : formatNaira(koboToNaira(kobo))}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ModeBadge({ isProtected }: { isProtected: boolean }) {
  return isProtected ? <Badge tone="success">🛡 Protected</Badge> : <Badge>Pay now</Badge>;
}

function ProtectedTerms({ payload }: { payload: LinkPayload }) {
  const { terms } = payload;
  const arbiterKnown =
    terms.arbiter !== zeroAddress && terms.arbiter.toLowerCase() === env.arbiterAddress?.toLowerCase();
  return (
    <div className="mt-4 space-y-2 rounded-xl bg-success-soft p-4 text-sm text-fg ring-1 ring-success/20">
      <p className="font-semibold text-success">Your money is held safely until delivery</p>
      <ul className="space-y-1.5">
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
            <span className="font-medium text-warning">
              Disputes go to an unrecognised referee ({shortAddress(terms.arbiter)}). Only pay if you
              trust them.
            </span>
          )}
        </li>
      </ul>
    </div>
  );
}
