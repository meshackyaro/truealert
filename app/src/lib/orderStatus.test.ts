import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { OrderStatus, type Order } from "./invoice";
import { buyerActions, orderPhase, orderSteps } from "./orderStatus";

const order: Order = {
  seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  shipDeadline: 1_000n,
  buyer: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  confirmDeadline: 0n,
  token: zeroAddress,
  disputeDeadline: 0n,
  arbiter: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  confirmWindow: 86_400,
  feeBps: 0,
  status: OrderStatus.Funded,
  extended: false,
  amount: 1n,
};
const shipped = { ...order, status: OrderStatus.Shipped, confirmDeadline: 2_000n };
const disputed = { ...shipped, status: OrderStatus.Disputed, disputeDeadline: 3_000n };

describe("orderPhase", () => {
  it("tracks the ship deadline (inclusive, like the contract)", () => {
    expect(orderPhase(order, 1_000)).toBe("awaiting-shipment");
    expect(orderPhase(order, 1_001)).toBe("ship-overdue");
  });

  it("tracks the confirm and arbiter deadlines", () => {
    expect(orderPhase(shipped, 2_000)).toBe("shipped");
    expect(orderPhase(shipped, 2_001)).toBe("confirm-overdue");
    expect(orderPhase(disputed, 3_000)).toBe("disputed");
    expect(orderPhase(disputed, 3_001)).toBe("arbiter-overdue");
  });

  it("maps final states", () => {
    expect(orderPhase({ ...order, status: OrderStatus.Released }, 0)).toBe("released");
    expect(orderPhase({ ...order, status: OrderStatus.Refunded }, 0)).toBe("refunded");
    expect(orderPhase({ ...order, status: OrderStatus.Resolved }, 0)).toBe("resolved");
  });
});

describe("buyerActions", () => {
  it("while awaiting shipment: only confirm (e.g. collected in person)", () => {
    expect(buyerActions(order, 500)).toEqual({
      confirm: true,
      reclaim: false,
      extend: false,
      dispute: false,
      timeoutRefund: false,
    });
  });

  it("after the seller misses the ship deadline: reclaim", () => {
    expect(buyerActions(order, 1_001).reclaim).toBe(true);
  });

  it("after shipping: confirm, extend, dispute", () => {
    expect(buyerActions(shipped, 1_500)).toMatchObject({ confirm: true, extend: true, dispute: true });
  });

  it("no second extension, no dispute without an arbiter", () => {
    expect(buyerActions({ ...shipped, extended: true }, 1_500).extend).toBe(false);
    expect(buyerActions({ ...shipped, arbiter: zeroAddress }, 1_500).dispute).toBe(false);
  });

  it("no extend or dispute after the confirm deadline, but confirm still works", () => {
    expect(buyerActions(shipped, 2_001)).toMatchObject({ confirm: true, extend: false, dispute: false });
  });

  it("while disputed: nothing until the arbiter deadline passes", () => {
    expect(buyerActions(disputed, 2_500)).toEqual({
      confirm: false,
      reclaim: false,
      extend: false,
      dispute: false,
      timeoutRefund: false,
    });
    expect(buyerActions(disputed, 3_001).timeoutRefund).toBe(true);
  });
});

describe("orderSteps", () => {
  it("shows progress for a shipped order", () => {
    expect(orderSteps(shipped).map((s) => s.state)).toEqual(["done", "done", "current", "todo"]);
  });

  it("labels refunds and disputes", () => {
    expect(orderSteps({ ...order, status: OrderStatus.Refunded }).at(-1)?.label).toBe("Refunded");
    expect(orderSteps(disputed)[2].label).toBe("Under review");
  });
});
