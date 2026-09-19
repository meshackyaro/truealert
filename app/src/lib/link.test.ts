import { zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { decodeLink, encodeLink, type LinkPayload } from "./link";
import { hashOrderDetails, Mode, type OrderDetails } from "./terms";

const details: OrderDetails = {
  v: 1,
  item: "Ankara dress 👗",
  priceNgn: "15000",
  sellerName: "Chioma's Closet",
  rate: { ngnPerUsd: "1373.28", source: "quidax", at: "2026-09-19T13:14:00.000Z" },
};

const payload: LinkPayload = {
  chainId: 5_201_420,
  contract: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  signature: `0x${"ab".repeat(65)}`,
  details,
  terms: {
    id: `0x${"11".repeat(32)}`,
    mode: Mode.Protected,
    seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    token: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    amount: 10_920_000n,
    expiry: 1_790_172_800n,
    buyer: zeroAddress,
    shipWindow: 86_400,
    confirmWindow: 86_400,
    arbiter: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    ref: hashOrderDetails(details),
  },
};

describe("payment links", () => {
  it("round-trips", () => {
    const result = decodeLink(encodeLink(payload));
    expect(result).toEqual({ ok: true, payload });
  });

  it("is URL-safe and reasonably short", () => {
    const encoded = encodeLink(payload);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(1100);
  });

  it("recomputes ref from details, so edited details change ref", () => {
    const edited = { ...payload, details: { ...details, priceNgn: "1500" } };
    const result = decodeLink(encodeLink(edited));
    expect(result.ok && result.payload.terms.ref).not.toBe(payload.terms.ref);
  });

  it("rejects garbage", () => {
    expect(decodeLink("not-a-link").ok).toBe(false);
    expect(decodeLink("").ok).toBe(false);
  });

  it("rejects links with extra detail fields", () => {
    const sneaky = { ...payload, details: { ...details, verified: true } as unknown as OrderDetails };
    expect(decodeLink(encodeLink(sneaky))).toEqual({
      ok: false,
      error: "Unexpected field in order details.",
    });
  });

  it("rejects over-long item names", () => {
    const long = { ...payload, details: { ...details, item: "x".repeat(81) } };
    expect(decodeLink(encodeLink(long)).ok).toBe(false);
  });

  it("rejects a bad naira price", () => {
    const bad = { ...payload, details: { ...details, priceNgn: "15,000" } };
    expect(decodeLink(encodeLink(bad))).toEqual({ ok: false, error: "Bad naira price." });
  });

  it("rejects an invalid mode", () => {
    const bad = { ...payload, terms: { ...payload.terms, mode: 7 as never } };
    expect(decodeLink(encodeLink(bad))).toEqual({ ok: false, error: "Bad payment mode in link." });
  });

  it("normalizes address checksums", () => {
    const lower = {
      ...payload,
      terms: { ...payload.terms, seller: payload.terms.seller.toLowerCase() as `0x${string}` },
    };
    const result = decodeLink(encodeLink(lower));
    expect(result.ok && result.payload.terms.seller).toBe(payload.terms.seller);
  });
});
