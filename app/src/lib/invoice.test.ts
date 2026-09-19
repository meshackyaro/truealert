import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import {
  deriveInvoiceView,
  isReservedForSomeoneElse,
  OrderStatus,
  type ChainReads,
  type InvoiceInputs,
  type Order,
} from "./invoice";
import type { LinkPayload } from "./link";
import { hashOrderDetails, Mode, type OrderDetails } from "./terms";

const CONTRACT: Address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const details: OrderDetails = { v: 1, item: "Ankara dress", priceNgn: "15000" };

const payload: LinkPayload = {
  chainId: 31337,
  contract: CONTRACT,
  signature: "0x01",
  details,
  terms: {
    id: `0x${"11".repeat(32)}`,
    mode: Mode.PayNow,
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    token: zeroAddress,
    amount: 1n,
    expiry: 2_000n,
    buyer: zeroAddress,
    shipWindow: 0,
    confirmWindow: 0,
    arbiter: zeroAddress,
    ref: hashOrderDetails(details),
  },
};

const noOrder: Order = {
  seller: zeroAddress,
  shipDeadline: 0n,
  buyer: zeroAddress,
  confirmDeadline: 0n,
  token: zeroAddress,
  disputeDeadline: 0n,
  arbiter: zeroAddress,
  confirmWindow: 0,
  feeBps: 0,
  status: OrderStatus.None,
  extended: false,
  amount: 0n,
};

const okReads: ChainReads = {
  signatureValid: true,
  tokenAllowed: true,
  used: false,
  order: noOrder,
  paused: false,
};

const base: InvoiceInputs = {
  payload,
  appChainId: 31337,
  appContract: CONTRACT,
  tokenSupported: true,
  reads: okReads,
  readsFailed: false,
  nowSeconds: 1_000,
};

/** `over` is spread last, so `{ reads: undefined }` simulates "still loading". */
const view = (over: Partial<InvoiceInputs>, reads: Partial<ChainReads> = {}) =>
  deriveInvoiceView({ ...base, reads: { ...okReads, ...reads }, ...over }).kind;

describe("deriveInvoiceView", () => {
  it("is payable when everything checks out", () => {
    expect(view({})).toBe("payable");
  });

  it("flags links for another chain or contract", () => {
    expect(view({ appChainId: 5_201_420 })).toBe("wrong-network");
    expect(view({ appContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" })).toBe("wrong-network");
    expect(view({ appContract: undefined })).toBe("wrong-network");
  });

  it("refuses tokens the app doesn't know", () => {
    expect(view({ tokenSupported: false })).toBe("unsupported-token");
  });

  it("waits for chain reads, and reports failures", () => {
    expect(view({ reads: undefined })).toBe("loading");
    expect(view({ readsFailed: true })).toBe("unavailable");
  });

  it("warns about invalid signatures", () => {
    expect(view({}, { signatureValid: false })).toBe("invalid-signature");
  });

  it("reports disabled tokens, pause and expiry", () => {
    expect(view({}, { tokenAllowed: false })).toBe("token-disabled");
    expect(view({}, { paused: true })).toBe("paused");
    expect(view({ nowSeconds: 2_001 })).toBe("expired");
    expect(view({ nowSeconds: 2_000 })).toBe("payable");
  });

  it("shows paid invoices even after expiry", () => {
    expect(view({ nowSeconds: 9_999 }, { used: true })).toBe("paid");
  });

  it("shows an existing protected order regardless of link state", () => {
    const protectedPayload = { ...payload, terms: { ...payload.terms, mode: Mode.Protected } };
    const result = deriveInvoiceView({
      ...base,
      payload: protectedPayload,
      nowSeconds: 9_999,
      reads: { ...okReads, used: true, signatureValid: false, order: { ...noOrder, status: OrderStatus.Shipped } },
    });
    expect(result).toEqual({ kind: "order", order: { ...noOrder, status: OrderStatus.Shipped } });
  });
});

describe("isReservedForSomeoneElse", () => {
  const buyer: Address = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
  const locked = { ...payload, terms: { ...payload.terms, buyer } };

  it("is false for open links", () => {
    expect(isReservedForSomeoneElse(payload, undefined)).toBe(false);
  });

  it("is true for other wallets or when disconnected", () => {
    expect(isReservedForSomeoneElse(locked, undefined)).toBe(true);
    expect(isReservedForSomeoneElse(locked, "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")).toBe(true);
  });

  it("is false for the reserved wallet, any case", () => {
    expect(isReservedForSomeoneElse(locked, buyer.toLowerCase() as Address)).toBe(false);
  });
});
