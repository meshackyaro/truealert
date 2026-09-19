"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Notice } from "@/components/Shell";
import { txStatusLabel, useContractTx } from "@/hooks/useContractTx";
import { trueAlertAppAbi } from "@/lib/errors";
import { formatNaira, shortAddress } from "@/lib/format";
import { OrderStatus, type Order } from "@/lib/invoice";
import type { LinkPayload } from "@/lib/link";
import { buyerActions } from "@/lib/orderStatus";
import { WalletGate } from "./WalletGate";

type BuyerCall = "confirmReceived" | "reclaim" | "extend";

type Props = {
  payload: LinkPayload;
  order: Order;
  now: number;
  onChanged: () => void;
};

/** The buyer's buttons for a Protected order. Only the paying wallet may act. */
export function OrderActions(props: Props) {
  const actions = buyerActions(props.order, props.now);
  if (!Object.values(actions).some(Boolean)) return null;
  return (
    <WalletGate prompt="Connect the wallet you paid with">
      <BuyerOnly {...props} />
    </WalletGate>
  );
}

function BuyerOnly({ payload, order, now, onChanged }: Props) {
  const { address } = useAccount();
  const tx = useContractTx();
  const [running, setRunning] = useState<BuyerCall>();
  const [extendHours, setExtendHours] = useState<number>();
  const actions = buyerActions(order, now);

  if (address?.toLowerCase() !== order.buyer.toLowerCase()) {
    return (
      <Notice tone="info" title="Only the buyer can act on this order">
        It was paid from {shortAddress(order.buyer)}. Connect that wallet to confirm delivery or
        report a problem.
      </Notice>
    );
  }

  const busyLabel = txStatusLabel[tx.status] ?? "";

  const call = async (functionName: BuyerCall, extendBy?: number) => {
    setRunning(functionName);
    const target = { address: payload.contract, abi: trueAlertAppAbi } as const;
    const id = payload.terms.id;
    const hash =
      functionName === "extend"
        ? await tx.send({ ...target, functionName, args: [id, extendBy ?? 48 * 3600] })
        : await tx.send({ ...target, functionName, args: [id] });
    if (hash) onChanged();
  };

  /** Props for the button that triggers `fn`: spinner only on the active one. */
  const state = (fn: BuyerCall, idle: string) => ({
    label: tx.busy && running === fn ? busyLabel : idle,
    busy: tx.busy && running === fn,
    disabled: tx.busy && running !== fn,
  });

  const price = formatNaira(payload.details.priceNgn);

  return (
    <div className="space-y-3">
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
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-sm font-medium">Not arrived yet?</p>
          <p className="text-xs text-neutral-500">
            Give the delivery more time. You can do this once.
          </p>
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
      {order.extended && order.status === OrderStatus.Shipped && (
        <p className="px-1 text-xs text-neutral-500">You&apos;ve extended this delivery once.</p>
      )}
      {tx.error && <p className="px-1 text-sm text-red-700">{tx.error}</p>}
    </div>
  );
}
