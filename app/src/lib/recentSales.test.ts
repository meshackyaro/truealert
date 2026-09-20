import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { OrderStatus, type Order } from "./invoice";
import { encodeLink, type LinkPayload } from "./link";
import { addSale, loadSales, saleBadge, type KeyValueStore } from "./recentSales";
import { hashOrderDetails, Mode, type OrderDetails } from "./terms";

const SELLER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const OTHER: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

function payload(seller: Address, mode: Mode, n = 1): LinkPayload {
  const details: OrderDetails = { v: 1, item: `Item ${n}`, priceNgn: "15000" };
  return {
    chainId: 31337,
    contract: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    signature: "0x01",
    details,
    terms: {
      id: `0x${n.toString(16).padStart(64, "0")}`,
      mode,
      seller,
      token: zeroAddress,
      amount: 1n,
      expiry: 2_000n,
      buyer: zeroAddress,
      shipWindow: 86_400,
      confirmWindow: 86_400,
      arbiter: zeroAddress,
      ref: hashOrderDetails(details),
    },
  };
}
const urlFor = (p: LinkPayload) => `http://localhost:3000/pay?d=${encodeLink(p)}`;

describe("recent sales storage", () => {
  it("adds newest first, dedupes and decodes", () => {
    const store = memoryStore();
    const a = urlFor(payload(SELLER, Mode.PayNow, 1));
    const b = urlFor(payload(SELLER, Mode.Protected, 2));
    addSale(store, SELLER, { url: a, fromBlock: "1", createdAt: 1 });
    addSale(store, SELLER, { url: b, fromBlock: "2", createdAt: 2 });
    addSale(store, SELLER, { url: a, fromBlock: "1", createdAt: 3 });
    const sales = loadSales(store, SELLER);
    expect(sales.map((s) => s.payload.details.item)).toEqual(["Item 1", "Item 2"]);
  });

  it("keeps at most 30", () => {
    const store = memoryStore();
    for (let i = 1; i <= 35; i++) addSale(store, SELLER, { url: urlFor(payload(SELLER, Mode.PayNow, i)), fromBlock: "0", createdAt: i });
    expect(loadSales(store, SELLER)).toHaveLength(30);
  });

  it("ignores links for another seller and corrupt storage", () => {
    const store = memoryStore();
    addSale(store, SELLER, { url: urlFor(payload(OTHER, Mode.PayNow)), fromBlock: "0", createdAt: 1 });
    expect(loadSales(store, SELLER)).toEqual([]);
    store.data.set(`truealert:sales:${SELLER.toLowerCase()}`, "{not json");
    expect(loadSales(store, SELLER)).toEqual([]);
  });
});

describe("saleBadge", () => {
  const none: Order = {
    seller: SELLER, shipDeadline: 0n, buyer: zeroAddress, confirmDeadline: 0n, token: zeroAddress,
    disputeDeadline: 0n, arbiter: zeroAddress, confirmWindow: 0, feeBps: 0, status: OrderStatus.None,
    extended: false, amount: 0n,
  };

  it("pay-now: waiting, paid, expired", () => {
    const p = payload(SELLER, Mode.PayNow);
    expect(saleBadge(p, { used: false, order: none }, 1_000).label).toBe("Waiting for payment");
    expect(saleBadge(p, { used: true, order: none }, 9_999).label).toBe("Paid ✓");
    expect(saleBadge(p, { used: false, order: none }, 2_001).label).toBe("Expired");
  });

  it("protected: follows the order through its life", () => {
    const p = payload(SELLER, Mode.Protected);
    expect(saleBadge(p, { used: false, order: none }, 1_000).label).toBe("Waiting for buyer");
    const funded = { ...none, status: OrderStatus.Funded, shipDeadline: 5_000n };
    expect(saleBadge(p, { used: true, order: funded }, 1_000)).toEqual({ label: "Paid · ship now", tone: "action" });
    const shipped = { ...none, status: OrderStatus.Shipped, confirmDeadline: 5_000n };
    expect(saleBadge(p, { used: true, order: shipped }, 5_001).label).toBe("Ready to collect");
    expect(saleBadge(p, { used: true, order: { ...none, status: OrderStatus.Released } }, 0).label).toBe("Completed ✓");
  });

  it("shows a placeholder while loading", () => {
    expect(saleBadge(payload(SELLER, Mode.PayNow), undefined, 0).label).toBe("…");
  });
});
