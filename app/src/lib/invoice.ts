import { zeroAddress, type Address } from "viem";
import type { LinkPayload } from "./link";
import { Mode } from "./terms";

/** Mirrors `TrueAlert.Status`. */
export const OrderStatus = {
  None: 0,
  Funded: 1,
  Shipped: 2,
  Disputed: 3,
  Released: 4,
  Refunded: 5,
  Resolved: 6,
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

/** Mirrors `TrueAlert.Order` as viem returns it. */
export type Order = {
  seller: Address;
  shipDeadline: bigint;
  buyer: Address;
  confirmDeadline: bigint;
  token: Address;
  disputeDeadline: bigint;
  arbiter: Address;
  confirmWindow: number;
  feeBps: number;
  status: number;
  extended: boolean;
  amount: bigint;
};

/** What the buyer page should show for a link. */
export type InvoiceView =
  | { kind: "wrong-network" }
  | { kind: "unsupported-token" }
  | { kind: "loading" }
  | { kind: "unavailable" } // chain reads failed
  | { kind: "invalid-signature" }
  | { kind: "token-disabled" }
  | { kind: "paused" }
  | { kind: "expired" }
  | { kind: "payable" }
  | { kind: "paid" } // pay-now invoice already paid
  | { kind: "order"; order: Order }; // protected order exists on-chain

export type ChainReads = {
  signatureValid: boolean;
  tokenAllowed: boolean;
  used: boolean;
  order: Order;
  paused: boolean;
};

export type InvoiceInputs = {
  payload: LinkPayload;
  appChainId: number;
  appContract: Address | undefined;
  tokenSupported: boolean;
  reads: ChainReads | undefined;
  readsFailed: boolean;
  nowSeconds: number;
};

export function deriveInvoiceView(i: InvoiceInputs): InvoiceView {
  const { payload, reads } = i;
  if (payload.chainId !== i.appChainId || !i.appContract || payload.contract !== i.appContract) {
    return { kind: "wrong-network" };
  }
  if (!i.tokenSupported) return { kind: "unsupported-token" };
  if (i.readsFailed) return { kind: "unavailable" };
  if (!reads) return { kind: "loading" };

  // Existing on-chain state wins: a funded order or a paid invoice stays
  // viewable even after the link expires.
  if (payload.terms.mode === Mode.Protected && reads.order.status !== OrderStatus.None) {
    return { kind: "order", order: reads.order };
  }
  if (reads.used) return { kind: "paid" };

  if (!reads.signatureValid) return { kind: "invalid-signature" };
  if (!reads.tokenAllowed) return { kind: "token-disabled" };
  if (reads.paused) return { kind: "paused" };
  if (i.nowSeconds > Number(payload.terms.expiry)) return { kind: "expired" };
  return { kind: "payable" };
}

/** True if the link is reserved for a specific wallet other than `account`. */
export function isReservedForSomeoneElse(payload: LinkPayload, account: Address | undefined) {
  const reserved = payload.terms.buyer;
  if (reserved === zeroAddress) return false;
  return !account || account.toLowerCase() !== reserved.toLowerCase();
}
