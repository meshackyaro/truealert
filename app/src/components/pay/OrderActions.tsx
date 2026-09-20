"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Notice } from "@/components/Shell";
import { env } from "@/config/env";
import { useOrderCall } from "@/hooks/useOrderCall";
import { formatNaira, shortAddress } from "@/lib/format";
import { OrderStatus, type Order } from "@/lib/invoice";
import type { LinkPayload } from "@/lib/link";
import { buyerActions, sellerActions, viewerOf } from "@/lib/orderStatus";
import { SellerActions } from "./SellerActions";
import { WalletGate } from "./WalletGate";

export type OrderActionProps = {
  payload: LinkPayload;
  order: Order;
  now: number;
  onChanged: () => void;
};

/** Buttons for a Protected order, for whichever party's wallet is connected. */
export function OrderActions(props: OrderActionProps) {
  const anyBuyer = Object.values(buyerActions(props.order, props.now)).some(Boolean);
  const anySeller = Object.values(sellerActions(props.order, props.now)).some(Boolean);
  if (!anyBuyer && !anySeller) return null;
  return (
    <WalletGate prompt="Connect your wallet to manage this order">
      <ByViewer {...props} />
    </WalletGate>
  );
}

function ByViewer(props: OrderActionProps) {
  const { address } = useAccount();
  const viewer = viewerOf(props.order, address);
  if (viewer === "buyer") return <BuyerActions {...props} />;
  if (viewer === "seller") return <SellerActions {...props} />;
  return (
    <Notice tone="info" title="Only the buyer or seller can act on this order">
      It was paid from {shortAddress(props.order.buyer)}. Connect that wallet (or the seller&apos;s) to
      manage it.
    </Notice>
  );
}

function BuyerActions({ payload, order, now, onChanged }: OrderActionProps) {
  const { call, state, tx, running } = useOrderCall(payload, onChanged);
  const [extendHours, setExtendHours] = useState<number>();
  const actions = buyerActions(order, now);

  const price = formatNaira(payload.details.priceNgn);
  const referee =
    order.arbiter.toLowerCase() === env.arbiterAddress?.toLowerCase()
      ? "TrueAlert Resolution"
      : `the referee (${shortAddress(order.arbiter)})`;

  return (
    <div className="space-y-3">
      {actions.timeoutRefund && (
        <ConfirmButton
          {...state("resolveTimeout", "Get my full refund")}
          confirmLabel={`Tap again to refund ${price} to your wallet`}
          onConfirm={() => call("resolveTimeout")}
        />
      )}
      {actions.reclaim && (
        <ConfirmButton
          {...state("reclaim", "Take my money back")}
          confirmLabel={`Tap again to refund ${price} to your wallet`}
          onConfirm={() => call("reclaim")}
        />
      )}
      {actions.confirm && (
        <ConfirmButton
          {...state("confirmReceived", "I received it ✓")}
          variant={actions.reclaim ? "secondary" : "primary"}
          confirmLabel={`Tap again to release ${price} to the seller`}
          onConfirm={() => call("confirmReceived")}
        />
      )}
      {actions.extend && (
        <div className="rounded-xl bg-surface-muted p-3">
          <p className="text-sm font-medium">Not arrived yet?</p>
          <p className="text-xs text-muted">Give the delivery more time. You can do this once.</p>
          <div className="mt-2 flex gap-2">
            {[24, 48].map((hours) => (
              <Button
                key={hours}
                variant="secondary"
                className="min-h-10 text-sm"
                busy={tx.busy && running === "extend" && extendHours === hours}
                disabled={tx.busy}
                onClick={() => {
                  setExtendHours(hours);
                  void call("extend", hours * 3600);
                }}
              >
                +{hours} hours
              </Button>
            ))}
          </div>
        </div>
      )}
      {actions.dispute && (
        <div className="rounded-xl bg-danger-soft p-3 ring-1 ring-danger/20">
          <p className="text-sm font-medium">Something wrong?</p>
          <p className="text-xs text-muted">
            Nothing arrived, or it&apos;s not what you paid for? {referee} will decide within 14 days.
            Your money stays locked meanwhile, and if they don&apos;t decide in time you get a full
            refund. Keep your chat and delivery evidence ready.
          </p>
          <ConfirmButton
            {...state("dispute", "Report a problem")}
            variant="danger"
            className="mt-2 min-h-10 text-sm"
            confirmLabel={`Tap again to send this to ${referee}`}
            onConfirm={() => call("dispute")}
          />
        </div>
      )}
      {order.extended && order.status === OrderStatus.Shipped && (
        <p className="px-1 text-xs text-muted">You&apos;ve extended this delivery once.</p>
      )}
      {tx.error && <p className="px-1 text-sm text-danger">{tx.error}</p>}
    </div>
  );
}
