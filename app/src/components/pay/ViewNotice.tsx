import { Notice } from "@/components/Shell";
import { env } from "@/config/env";
import type { InvoiceView } from "@/lib/invoice";

/** Explains every non-payable state in plain language. */
export function ViewNotice({ view }: { view: InvoiceView }) {
  switch (view.kind) {
    case "wrong-network":
      return (
        <Notice tone="danger" title="This link is for a different network">
          It was made for another TrueAlert deployment than this site ({env.chain.name}). Ask the
          seller for a new link.
        </Notice>
      );
    case "unsupported-token":
      return (
        <Notice tone="danger" title="Unsupported currency">
          This link asks for a token TrueAlert doesn&apos;t recognise. Don&apos;t pay it.
        </Notice>
      );
    case "unavailable":
      return (
        <Notice tone="warning" title="Can't reach the Electroneum network">
          Check your connection. We&apos;ll keep retrying.
        </Notice>
      );
    case "invalid-signature":
      return (
        <Notice tone="danger" title="Not signed by the seller. Don't pay.">
          The details in this link don&apos;t match what the seller signed. It may have been edited.
        </Notice>
      );
    case "token-disabled":
      return (
        <Notice tone="warning" title="Currency no longer accepted">
          Ask the seller for a new link in another currency.
        </Notice>
      );
    case "paused":
      return (
        <Notice tone="warning" title="New payments are paused">
          TrueAlert has paused new payments for now. Please try again later.
        </Notice>
      );
    case "expired":
      return (
        <Notice tone="warning" title="This link has expired">
          Prices are locked for a short time. Ask the seller for a fresh link.
        </Notice>
      );
    case "paid":
      return (
        <Notice tone="success" title="Paid ✓">
          This invoice has been paid on the Electroneum blockchain.
        </Notice>
      );
    default:
      return null;
  }
}
