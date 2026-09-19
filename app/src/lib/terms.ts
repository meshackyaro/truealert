import { keccak256, stringToBytes, type Address, type Hex } from "viem";

/** Mirrors `TrueAlert.Mode`. */
export const Mode = { PayNow: 0, Protected: 1 } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** Mirrors `TrueAlert.Terms` with viem's ABI types (uint64 → bigint, uint32 → number). */
export type Terms = {
  id: Hex;
  mode: Mode;
  seller: Address;
  token: Address; // zeroAddress = native ETN
  amount: bigint;
  expiry: bigint; // unix seconds
  buyer: Address; // zeroAddress = open link
  shipWindow: number; // seconds, Protected only
  confirmWindow: number; // seconds, Protected only
  arbiter: Address; // zeroAddress = no disputes
  ref: Hex; // hashOrderDetails(details)
};

/** EIP-712 types; must match TERMS_TYPEHASH in TrueAlert.sol exactly. */
export const termsTypes = {
  Terms: [
    { name: "id", type: "bytes32" },
    { name: "mode", type: "uint8" },
    { name: "seller", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiry", type: "uint64" },
    { name: "buyer", type: "address" },
    { name: "shipWindow", type: "uint32" },
    { name: "confirmWindow", type: "uint32" },
    { name: "arbiter", type: "address" },
    { name: "ref", type: "bytes32" },
  ],
} as const;

export function termsDomain(chainId: number, verifyingContract: Address) {
  return { name: "TrueAlert", version: "1", chainId, verifyingContract } as const;
}

/**
 * Human-facing order details. Kept off-chain (and in the payment link); the
 * signed terms commit to them through `ref`, so the buyer page can prove the
 * item and naira price it shows are what the seller signed.
 */
export type OrderDetails = {
  v: 1;
  item: string;
  priceNgn: string; // decimal naira, e.g. "15000"
  sellerName?: string;
  note?: string;
  /** Rate locked when the invoice was created. */
  rate?: {
    ngnPerUsd: string; // e.g. "1373.28"
    source: "quidax" | "official";
    at: string; // ISO 8601
  };
};

export const DETAIL_LIMITS = { item: 80, sellerName: 60, note: 280 } as const;

/** JSON with object keys sorted and undefined fields dropped, so the same
 *  details always serialize (and hash) identically. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** The `ref` the seller signs for these details. */
export function hashOrderDetails(details: OrderDetails): Hex {
  return keccak256(stringToBytes(canonicalJson(details)));
}
