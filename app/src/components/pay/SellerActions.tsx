"use client";

import { ConfirmButton } from "@/components/ConfirmButton";
import { useOrderCall } from "@/hooks/useOrderCall";
import { formatNaira } from "@/lib/format";
import { sellerActions } from "@/lib/orderStatus";
import type { OrderActionProps } from "./OrderActions";

/** The seller's buttons for a Protected order. */
export function SellerActions({ payload, order, now, onChanged }: OrderActionProps) {
  const { call, state, tx } = useOrderCall(payload, onChanged);
  const actions = sellerActions(order, now);
  const price = formatNaira(payload.details.priceNgn);

  return (
    <div className="space-y-3">
      {actions.ship && (
        <ConfirmButton
          {...state("markShipped", "Mark as shipped")}
          confirmLabel="Tap again to confirm you've sent it"
          onConfirm={() => call("markShipped")}
        />
      )}
      {actions.claim && (
        <ConfirmButton
          {...state("claim", `Collect ${price}`)}
          confirmLabel={`Tap again to collect ${price}`}
          onConfirm={() => call("claim")}
        />
      )}
      {actions.cancel && (
        <details className="rounded-xl bg-surface-muted p-3 text-sm">
          <summary className="cursor-pointer text-muted">Can&apos;t fulfil this order?</summary>
          <p className="mt-2 text-xs text-muted">
            Out of stock, or someone you don&apos;t know paid this link? Cancel and the buyer gets the full
            amount back straight away.
          </p>
          <ConfirmButton
            {...state("cancel", "Cancel and refund the buyer")}
            variant="danger"
            className="mt-2 min-h-10 text-sm"
            confirmLabel={`Tap again to refund ${price} to the buyer`}
            onConfirm={() => call("cancel")}
          />
        </details>
      )}
      {tx.error && <p className="px-1 text-sm text-danger">{tx.error}</p>}
    </div>
  );
}
