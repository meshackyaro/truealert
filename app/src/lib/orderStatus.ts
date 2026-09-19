import { zeroAddress } from "viem";
import { OrderStatus, type Order } from "./invoice";

/** Which step of the escrow journey an order is at, from the buyer's side. */
export type OrderPhase =
  | "awaiting-shipment" // funded, ship deadline not passed
  | "ship-overdue" // funded, seller missed the ship deadline → buyer can reclaim
  | "shipped" // waiting for buyer to confirm
  | "confirm-overdue" // buyer missed confirm deadline → seller can claim
  | "disputed" // with the arbiter
  | "arbiter-overdue" // arbiter missed the deadline → anyone can refund buyer
  | "released"
  | "refunded"
  | "resolved";

export function orderPhase(order: Order, nowSeconds: number): OrderPhase {
  switch (order.status) {
    case OrderStatus.Funded:
      return nowSeconds > Number(order.shipDeadline) ? "ship-overdue" : "awaiting-shipment";
    case OrderStatus.Shipped:
      return nowSeconds > Number(order.confirmDeadline) ? "confirm-overdue" : "shipped";
    case OrderStatus.Disputed:
      return nowSeconds > Number(order.disputeDeadline) ? "arbiter-overdue" : "disputed";
    case OrderStatus.Released:
      return "released";
    case OrderStatus.Refunded:
      return "refunded";
    default:
      return "resolved";
  }
}

/** Buyer actions the contract will accept right now. */
export function buyerActions(order: Order, nowSeconds: number) {
  const phase = orderPhase(order, nowSeconds);
  const open = order.status === OrderStatus.Funded || order.status === OrderStatus.Shipped;
  return {
    confirm: open,
    reclaim: phase === "ship-overdue",
    extend: phase === "shipped" && !order.extended,
    dispute: phase === "shipped" && order.arbiter !== zeroAddress,
    timeoutRefund: phase === "arbiter-overdue",
  };
}

/** Seller actions the contract will accept right now. */
export function sellerActions(order: Order, nowSeconds: number) {
  const phase = orderPhase(order, nowSeconds);
  return {
    ship: phase === "awaiting-shipment",
    claim: phase === "confirm-overdue",
    cancel: order.status === OrderStatus.Funded || order.status === OrderStatus.Shipped,
  };
}

export type Viewer = "buyer" | "seller" | "other";

export function viewerOf(order: Order, account: string | undefined): Viewer {
  const a = account?.toLowerCase();
  if (a && a === order.buyer.toLowerCase()) return "buyer";
  if (a && a === order.seller.toLowerCase()) return "seller";
  return "other";
}

/** The step-by-step progress shown on the order, as [label, state] pairs. */
export function orderSteps(order: Order): { label: string; state: "done" | "current" | "todo" }[] {
  const s = order.status;
  const shipped = s === OrderStatus.Shipped || s === OrderStatus.Disputed || s === OrderStatus.Released || s === OrderStatus.Resolved;
  const closed = s === OrderStatus.Released || s === OrderStatus.Refunded || s === OrderStatus.Resolved;
  const finalLabel =
    s === OrderStatus.Refunded
      ? "Refunded"
      : s === OrderStatus.Resolved
        ? "Resolved"
        : s === OrderStatus.Disputed
          ? "Decision"
          : "Seller paid";
  return [
    { label: "Paid into escrow", state: "done" },
    {
      label: "Shipped",
      state: shipped ? "done" : s === OrderStatus.Refunded ? "todo" : "current",
    },
    {
      label: s === OrderStatus.Disputed ? "Under review" : "Delivered",
      state: closed ? "done" : shipped ? "current" : "todo",
    },
    { label: finalLabel, state: closed ? "done" : "todo" },
  ];
}
