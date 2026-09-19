"use client";

import { ConfirmButton } from "@/components/ConfirmButton";
import { useOrderCall } from "@/hooks/useOrderCall";
import { sellerActions } from "@/lib/orderStatus";
import type { OrderActionProps } from "./OrderActions";

/** The seller's buttons for a Protected order. */
export function SellerActions({ payload, order, now, onChanged }: OrderActionProps) {
  const { call, state, tx } = useOrderCall(payload, onChanged);
  const actions = sellerActions(order, now);

  return (
    <div className="space-y-3">
      {actions.ship && (
        <ConfirmButton
          {...state("markShipped", "Mark as shipped")}
          confirmLabel="Tap again to confirm you've sent it"
          onConfirm={() => call("markShipped")}
        />
      )}
      {tx.error && <p className="px-1 text-sm text-red-700">{tx.error}</p>}
    </div>
  );
}
