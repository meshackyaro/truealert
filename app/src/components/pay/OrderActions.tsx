"use client";

import { useAccount } from "wagmi";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Notice } from "@/components/Shell";
import { txStatusLabel, useContractTx } from "@/hooks/useContractTx";
import { trueAlertAppAbi } from "@/lib/errors";
import { formatNaira, shortAddress } from "@/lib/format";
import type { Order } from "@/lib/invoice";
import type { LinkPayload } from "@/lib/link";
import { buyerActions } from "@/lib/orderStatus";
import { WalletGate } from "./WalletGate";

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
  const actions = buyerActions(order, now);

  if (address?.toLowerCase() !== order.buyer.toLowerCase()) {
    return (
      <Notice tone="info" title="Only the buyer can act on this order">
        It was paid from {shortAddress(order.buyer)}. Connect that wallet to confirm delivery or
        report a problem.
      </Notice>
    );
  }

  const call = async (functionName: "confirmReceived") => {
    const hash = await tx.send({
      address: payload.contract,
      abi: trueAlertAppAbi,
      functionName,
      args: [payload.terms.id],
    });
    if (hash) onChanged();
  };

  const price = formatNaira(payload.details.priceNgn);

  return (
    <div className="space-y-3">
      {actions.confirm && (
        <ConfirmButton
          label={tx.busy ? (txStatusLabel[tx.status] ?? "") : "I received it ✓"}
          confirmLabel={`Tap again to release ${price} to the seller`}
          onConfirm={() => call("confirmReceived")}
          busy={tx.busy}
        />
      )}
      {tx.error && <p className="px-1 text-sm text-red-700">{tx.error}</p>}
    </div>
  );
}
