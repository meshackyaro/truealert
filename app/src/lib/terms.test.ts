import { hashTypedData, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  hashOrderDetails,
  Mode,
  termsDomain,
  termsTypes,
  type OrderDetails,
  type Terms,
} from "./terms";

const details: OrderDetails = {
  v: 1,
  item: "Ankara dress",
  priceNgn: "15000",
  sellerName: "Chioma's Closet",
  rate: { ngnPerUsd: "1373.28", source: "quidax", at: "2026-09-19T13:14:00.000Z" },
};

describe("canonicalJson", () => {
  it("sorts keys at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("drops undefined fields", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("hashOrderDetails", () => {
  it("ignores key order", () => {
    const reordered = {
      rate: details.rate,
      priceNgn: "15000",
      v: 1,
      sellerName: "Chioma's Closet",
      item: "Ankara dress",
    } as OrderDetails;
    expect(hashOrderDetails(reordered)).toBe(hashOrderDetails(details));
  });

  it("changes when the price changes", () => {
    expect(hashOrderDetails({ ...details, priceNgn: "1500" })).not.toBe(hashOrderDetails(details));
  });

  it("changes when the item changes", () => {
    expect(hashOrderDetails({ ...details, item: "Ankara dres" })).not.toBe(
      hashOrderDetails(details),
    );
  });
});

describe("EIP-712 terms", () => {
  it("signs terms that recover to the seller", async () => {
    const seller = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const terms: Terms = {
      id: "0x1111111111111111111111111111111111111111111111111111111111111111",
      mode: Mode.PayNow,
      seller: seller.address,
      token: zeroAddress,
      amount: 9_600n * 10n ** 18n,
      expiry: 1_790_000_900n,
      buyer: zeroAddress,
      shipWindow: 0,
      confirmWindow: 0,
      arbiter: zeroAddress,
      ref: hashOrderDetails(details),
    };
    const domain = termsDomain(5_201_420, "0x5FbDB2315678afecb367f032d93F642f64180aa3");
    const signature = await seller.signTypedData({
      domain,
      types: termsTypes,
      primaryType: "Terms",
      message: terms,
    });
    const digest = hashTypedData({ domain, types: termsTypes, primaryType: "Terms", message: terms });
    const { recoverAddress } = await import("viem");
    expect(await recoverAddress({ hash: digest, signature })).toBe(seller.address);
  });
});
