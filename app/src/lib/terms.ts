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

/** One line of a sale: "2 × Ankara dress @ ₦7,500". */
export type LineItem = {
  name: string;
  qty: number; // whole units, 1..999
  unitNgn: string; // decimal naira per unit
};

/**
 * Human-facing order details. Kept off-chain (and in the payment link); the
 * signed terms commit to them through `ref`, so the buyer page can prove the
 * items and naira price it shows are what the seller signed.
 */
export type OrderDetails = {
  v: 1;
  /** Short summary of the sale, e.g. "Ankara dress" or "Ankara dress +2 more". */
  item: string;
  /** Total naira for the whole sale; this is what gets converted and signed. */
  priceNgn: string; // decimal naira, e.g. "15000"
  /** Optional breakdown; when present it must add up to priceNgn. */
  items?: LineItem[];
  sellerName?: string;
  note?: string;
  /** Rate locked when the invoice was created. */
  rate?: {
    ngnPerUsd: string; // e.g. "1373.28"
    source: "quidax" | "official";
    at: string; // ISO 8601
  };
};

export const DETAIL_LIMITS = {
  item: 80,
  sellerName: 60,
  note: 280,
  itemName: 60,
  items: 20,
  qty: 999,
} as const;

/** Sum of a breakdown, in kobo (1/100 naira), or null if any line is malformed. */
export function lineItemsTotalKobo(items: LineItem[]): bigint | null {
  let total = 0n;
  for (const line of items) {
    if (!Number.isInteger(line.qty) || line.qty < 1 || line.qty > DETAIL_LIMITS.qty) return null;
    if (!/^\d+(\.\d{1,2})?$/.test(line.unitNgn)) return null;
    const [whole, fraction = ""] = line.unitNgn.split(".");
    const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
    total += kobo * BigInt(line.qty);
  }
  return total;
}

/** Kobo as a naira decimal string: 1500050n → "15000.5". */
export function koboToNaira(kobo: bigint): string {
  const whole = kobo / 100n;
  const rest = Number(kobo % 100n);
  if (rest === 0) return whole.toString();
  return `${whole}.${String(rest).padStart(2, "0").replace(/0$/, "")}`;
}

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
