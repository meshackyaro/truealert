import { zeroAddress, type Address } from "viem";
import { describe, expect, it } from "vitest";
import { ETN, type Token } from "@/config/tokens";
import { buildSale, quoteAmount, validateSale, type SaleInput } from "./sale";
import { hashOrderDetails, Mode } from "./terms";

const USDC: Token = {
  address: "0x3F2f8D53F9A306eF2A1eF819EC8844883c1916a5",
  symbol: "USDC",
  name: "USD Coin",
  decimals: 6,
  native: false,
};
const SELLER: Address = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const ARBITER: Address = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const rate = { ngnPerUsd: "1373.28", etnUsd: "0.00114", source: "quidax" as const, at: "2026-09-19T11:00:00.000Z" };

describe("quoteAmount", () => {
  it("rounds USDC up to the next cent", () => {
    // 15000 / 1373.28 = 10.9228… → 10.93 USDC
    expect(quoteAmount("15000", rate, USDC)).toBe(10_930_000n);
  });

  it("is exact when it divides evenly", () => {
    expect(quoteAmount("1373.28", rate, USDC)).toBe(1_000_000n);
  });

  it("rounds ETN up to 0.01", () => {
    // 15000 / 1373.28 / 0.00114 = 9581.363… → 9581.37 ETN
    expect(quoteAmount("15000", rate, ETN)).toBe(958_137n * 10n ** 16n);
  });

  it("never quotes less than the naira price", () => {
    for (const price of ["1", "99.99", "2500", "15000", "123456.78"]) {
      const units = quoteAmount(price, rate, USDC)!;
      const ngnValue = (Number(units) / 1e6) * Number(rate.ngnPerUsd);
      expect(ngnValue).toBeGreaterThanOrEqual(Number(price) - 1e-9);
    }
  });

  it("can't quote ETN without an ETN price, or bad input", () => {
    expect(quoteAmount("15000", { ...rate, etnUsd: null }, ETN)).toBeNull();
    expect(quoteAmount("abc", rate, USDC)).toBeNull();
    expect(quoteAmount("0", rate, USDC)).toBeNull();
  });
});

const base: SaleInput = {
  mode: Mode.Protected,
  seller: SELLER,
  token: USDC,
  priceNgn: "15000",
  item: "  Ankara dress  ",
  sellerName: "Chioma's Closet",
  rate,
  delivery: { preset: "interstate" },
  arbiter: ARBITER,
};

describe("validateSale", () => {
  it("accepts a normal sale", () => {
    expect(validateSale(base)).toEqual({});
  });

  it("rejects bad prices and empty items", () => {
    expect(validateSale({ ...base, priceNgn: "15,000" }).priceNgn).toBeDefined();
    expect(validateSale({ ...base, priceNgn: "0" }).priceNgn).toBeDefined();
    expect(validateSale({ ...base, item: "   " }).item).toBeDefined();
  });

  it("enforces the contract's window bounds for custom delivery", () => {
    expect(validateSale({ ...base, delivery: { shipHours: 0.5, confirmHours: 24 } }).delivery).toBeDefined();
    expect(validateSale({ ...base, delivery: { shipHours: 24, confirmHours: 6 } }).delivery).toBeDefined();
    expect(validateSale({ ...base, delivery: { shipHours: 2, confirmHours: 12 } }).delivery).toBeUndefined();
  });

  it("flags an ETN sale when no ETN price is available", () => {
    expect(validateSale({ ...base, token: ETN, rate: { ...rate, etnUsd: null } }).rate).toMatch(/ETN/);
  });

  it("stops a seller locking the link to their own wallet", () => {
    expect(validateSale({ ...base, lockToBuyer: SELLER }).lockToBuyer).toBeDefined();
  });
});

describe("buildSale", () => {
  const id = `0x${"ab".repeat(32)}` as const;

  it("builds protected terms with preset windows, arbiter and 48h expiry", () => {
    const { terms, details } = buildSale(base, 1_000, id);
    expect(terms).toMatchObject({
      id,
      mode: Mode.Protected,
      seller: SELLER,
      token: USDC.address,
      amount: 10_930_000n,
      expiry: 1_000n + 48n * 3600n,
      buyer: zeroAddress,
      shipWindow: 3 * 86_400,
      confirmWindow: 5 * 86_400,
      arbiter: ARBITER,
    });
    expect(details.item).toBe("Ankara dress");
    expect(terms.ref).toBe(hashOrderDetails(details));
  });

  it("builds pay-now terms: 15 min expiry, no windows, no arbiter", () => {
    const { terms } = buildSale({ ...base, mode: Mode.PayNow }, 1_000, id);
    expect(terms).toMatchObject({ expiry: 1_900n, shipWindow: 0, confirmWindow: 0, arbiter: zeroAddress });
  });

  it("omits empty optional details so hashes stay canonical", () => {
    const { details } = buildSale({ ...base, sellerName: " ", note: "" }, 1_000, id);
    expect("sellerName" in details || "note" in details).toBe(false);
  });

  it("generates random 32-byte ids by default", () => {
    const a = buildSale(base, 1_000).terms.id;
    const b = buildSale(base, 1_000).terms.id;
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
