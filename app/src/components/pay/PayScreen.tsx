"use client";

import { Notice } from "@/components/Shell";
import { useInvoice } from "@/hooks/useInvoice";
import { decodeLink, type LinkPayload } from "@/lib/link";
import { InvoiceCard } from "./InvoiceCard";
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
  const { view, token, now } = useInvoice(payload);

  if (!token) return <ViewNotice view={{ kind: "unsupported-token" }} />;

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
        <p className="px-1 text-xs text-green-800">
          ✓ Signed by the seller. The price and details above can&apos;t be changed.
        </p>
      )}
      {view.kind === "loading" && (
        <p className="px-1 text-sm text-neutral-500">Checking the blockchain…</p>
      )}
      <ViewNotice view={view} />
    </>
  );
}
