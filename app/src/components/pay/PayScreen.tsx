"use client";

import { useState } from "react";
import type { Hash } from "viem";
import { useAccount } from "wagmi";
import { Notice } from "@/components/Shell";
import { useInvoice } from "@/hooks/useInvoice";
import { decodeLink, type LinkPayload } from "@/lib/link";
import { viewerOf } from "@/lib/orderStatus";
import { Mode } from "@/lib/terms";
import { InvoiceCard } from "./InvoiceCard";
import { OrderActions } from "./OrderActions";
import { OrderPanel } from "./OrderPanel";
import { PaidReceipt } from "./PaidReceipt";
import { PaymentAction } from "./PaymentAction";
import { WalletGate } from "./WalletGate";
import { ViewNotice } from "./ViewNotice";

export function PayScreen({ encoded }: { encoded: string }) {
  if (!encoded) {
    return (
      <Notice tone="warning" title="No payment link">
        Open the full link the seller sent you.
      </Notice>
    );
  }
  const result = decodeLink(encoded);
  if (!result.ok) {
    return (
      <Notice tone="danger" title="This payment link isn't valid">
        {result.error} Ask the seller to send it again.
      </Notice>
    );
  }
  return <Invoice payload={result.payload} />;
}

function Invoice({ payload }: { payload: LinkPayload }) {
  const { view, token, now, refetch } = useInvoice(payload);
  const { address } = useAccount();
  const [paidHash, setPaidHash] = useState<Hash>();

  if (!token) return <ViewNotice view={{ kind: "unsupported-token" }} />;

  if (paidHash && payload.terms.mode === Mode.PayNow) {
    return <PaidReceipt payload={payload} token={token} hash={paidHash} />;
  }

  const untrusted = view.kind === "invalid-signature" || view.kind === "wrong-network";
  const verified = !untrusted && view.kind !== "loading" && view.kind !== "unavailable";

  if (untrusted) {
    // Warning first and the card greyed out, so a forged price never reads
    // as the headline.
    return (
      <>
        <ViewNotice view={view} />
        <div className="pointer-events-none opacity-40 grayscale" aria-hidden>
          <InvoiceCard payload={payload} token={token} now={now} showExpiry={false} />
        </div>
      </>
    );
  }

  return (
    <>
      <InvoiceCard
        payload={payload}
        token={token}
        now={now}
        showExpiry={view.kind === "payable" || view.kind === "expired"}
      />
      {verified && (
        <p className="flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2 text-xs text-success ring-1 ring-success/20">
          <span aria-hidden className="mt-px font-bold">
            ✓
          </span>
          <span>Signed by the seller. The price and details above can&apos;t be changed.</span>
        </p>
      )}
      {view.kind === "loading" && (
        <p className="flex items-center gap-2 px-1 text-sm text-muted">
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
          Checking the blockchain…
        </p>
      )}
      <ViewNotice view={view} />
      {view.kind === "payable" && (
        <WalletGate prompt="Connect wallet to pay">
          <PaymentAction
            payload={payload}
            token={token}
            onDone={(hash) => {
              setPaidHash(hash);
              void refetch();
            }}
          />
        </WalletGate>
      )}
      {view.kind === "order" && (
        <OrderPanel order={view.order} now={now} viewer={viewerOf(view.order, address)}>
          {now !== undefined && (
            <OrderActions
              payload={payload}
              order={view.order}
              now={now}
              onChanged={() => void refetch()}
            />
          )}
        </OrderPanel>
      )}
    </>
  );
}
