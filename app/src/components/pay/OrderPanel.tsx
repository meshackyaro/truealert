"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/Shell";
import type { Order } from "@/lib/invoice";
import { formatDeadline, formatTimeLeft } from "@/lib/format";
import { orderPhase, orderSteps, type OrderPhase } from "@/lib/orderStatus";

function headline(phase: OrderPhase, order: Order, now: number): { title: string; body: string } {
  switch (phase) {
    case "awaiting-shipment":
      return {
        title: "Paid into escrow · waiting for the seller to ship",
        body: `The seller must ship by ${formatDeadline(order.shipDeadline)} (${formatTimeLeft(order.shipDeadline, now)}). If they don't, you can take your money back.`,
      };
    case "ship-overdue":
      return {
        title: "The seller didn't ship in time",
        body: "You can take your money back now. Nothing was paid to the seller.",
      };
    case "shipped":
      return {
        title: "Shipped · confirm when it arrives",
        body: `Confirm by ${formatDeadline(order.confirmDeadline)} (${formatTimeLeft(order.confirmDeadline, now)}). If something's wrong, report it before then.`,
      };
    case "confirm-overdue":
      return {
        title: "Confirmation window has ended",
        body: "The seller can now collect the payment. You can still confirm delivery.",
      };
    case "disputed":
      return {
        title: "Under review",
        body: `The referee has until ${formatDeadline(order.disputeDeadline)} to decide. Your money stays locked until then.`,
      };
    case "arbiter-overdue":
      return {
        title: "The referee didn't decide in time",
        body: "You get a full refund. Anyone can trigger it now.",
      };
    case "released":
      return { title: "Completed ✓", body: "Delivery confirmed and the seller has been paid." };
    case "refunded":
      return { title: "Refunded ✓", body: "The full amount went back to the buyer's wallet." };
    case "resolved":
      return { title: "Dispute settled ✓", body: "The referee's decision has been paid out." };
  }
}

/** Where a Protected order stands, with the buyer's available actions below. */
export function OrderPanel({ order, now, children }: { order: Order; now: number | undefined; children?: ReactNode }) {
  const t = now ?? 0;
  const phase = orderPhase(order, t);
  const { title, body } = headline(phase, order, t);
  return (
    <Card>
      <ol className="mb-4 flex gap-1" aria-label="Order progress">
        {orderSteps(order).map((step) => (
          <li key={step.label} className="flex-1">
            <span
              className={`block h-1.5 rounded-full ${
                step.state === "done" ? "bg-brand" : step.state === "current" ? "bg-green-300" : "bg-neutral-200"
              }`}
            />
            <span className={`mt-1 block text-[11px] ${step.state === "todo" ? "text-neutral-400" : "text-neutral-700"}`}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
      <h2 className="text-lg font-semibold">{title}</h2>
      {now !== undefined && <p className="mt-1 text-sm text-neutral-600">{body}</p>}
      {children && <div className="mt-4">{children}</div>}
    </Card>
  );
}
