import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";
import {
  DETAIL_LIMITS,
  hashOrderDetails,
  lineItemsTotalKobo,
  Mode,
  type LineItem,
  type OrderDetails,
  type Terms,
} from "./terms";

/**
 * A payment link carries everything the buyer page needs, so it works with no
 * backend: the seller-signed terms, the signature, and the order details.
 *
 * `ref` is NOT transmitted — the page recomputes it from the details. Edited
 * details therefore change `ref`, which breaks the seller's signature.
 */
export type LinkPayload = {
  chainId: number;
  contract: Address;
  terms: Terms;
  signature: Hex;
  details: OrderDetails;
};

const VERSION = 1;

// Compact positional encoding keeps links (and QR codes) short.
type Wire = [
  v: number,
  chainId: number,
  contract: string,
  id: string,
  mode: number,
  seller: string,
  token: string,
  amount: string,
  expiry: string,
  buyer: string,
  shipWindow: number,
  confirmWindow: number,
  arbiter: string,
  signature: string,
  details: OrderDetails,
];

export function encodeLink(p: LinkPayload): string {
  const t = p.terms;
  const wire: Wire = [
    VERSION,
    p.chainId,
    p.contract,
    t.id,
    t.mode,
    t.seller,
    t.token,
    t.amount.toString(),
    t.expiry.toString(),
    t.buyer,
    t.shipWindow,
    t.confirmWindow,
    t.arbiter,
    p.signature,
    p.details,
  ];
  return toBase64Url(JSON.stringify(wire));
}

export type DecodeResult = { ok: true; payload: LinkPayload } | { ok: false; error: string };

export function decodeLink(encoded: string): DecodeResult {
  let wire: unknown;
  try {
    wire = JSON.parse(fromBase64Url(encoded));
  } catch {
    return fail("This link is damaged or incomplete.");
  }
  if (!Array.isArray(wire) || wire.length !== 15) return fail("This link is not a TrueAlert payment link.");
  if (wire[0] !== VERSION) return fail("This link was made by a newer version of TrueAlert.");

  const [, chainId, contract, id, mode, seller, token, amount, expiry, buyer, ship, confirm, arbiter, sig, details] =
    wire as unknown[];

  if (!isUint(chainId)) return fail("Bad network in link.");
  if (!isAddr(contract) || !isAddr(seller) || !isAddr(token) || !isAddr(buyer) || !isAddr(arbiter)) {
    return fail("Bad address in link.");
  }
  if (!isBytes32(id)) return fail("Bad invoice ID in link.");
  if (mode !== Mode.PayNow && mode !== Mode.Protected) return fail("Bad payment mode in link.");
  if (!isUintString(amount) || !isUintString(expiry)) return fail("Bad amount in link.");
  if (!isUint32(ship) || !isUint32(confirm)) return fail("Bad delivery windows in link.");
  if (typeof sig !== "string" || !isHex(sig) || sig.length < 4) return fail("Bad signature in link.");

  const detailsError = validateDetails(details);
  if (detailsError) return fail(detailsError);
  const d = details as OrderDetails;

  return {
    ok: true,
    payload: {
      chainId: chainId as number,
      contract: getAddress(contract as string),
      signature: sig as Hex,
      details: d,
      terms: {
        id: id as Hex,
        mode: mode as Mode,
        seller: getAddress(seller as string),
        token: getAddress(token as string),
        amount: BigInt(amount as string),
        expiry: BigInt(expiry as string),
        buyer: getAddress(buyer as string),
        shipWindow: ship as number,
        confirmWindow: confirm as number,
        arbiter: getAddress(arbiter as string),
        ref: hashOrderDetails(d),
      },
    },
  };
}

export function validateDetails(details: unknown): string | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) return "Missing order details.";
  const d = details as Record<string, unknown>;
  if (d.v !== 1) return "Unsupported order details.";
  if (!isShortString(d.item, DETAIL_LIMITS.item)) return "Missing or too-long item name.";
  if (typeof d.priceNgn !== "string" || !/^\d+(\.\d{1,2})?$/.test(d.priceNgn)) return "Bad naira price.";
  if (d.sellerName !== undefined && !isShortString(d.sellerName, DETAIL_LIMITS.sellerName)) {
    return "Seller name too long.";
  }
  if (d.note !== undefined && !isShortString(d.note, DETAIL_LIMITS.note, true)) return "Note too long.";
  const itemsError = validateLineItems(d.items, d.priceNgn as string);
  if (itemsError) return itemsError;
  if (d.rate !== undefined) {
    const r = d.rate as Record<string, unknown>;
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.ngnPerUsd !== "string" ||
      !/^\d+(\.\d+)?$/.test(r.ngnPerUsd) ||
      (r.source !== "quidax" && r.source !== "official") ||
      typeof r.at !== "string" ||
      Number.isNaN(Date.parse(r.at))
    ) {
      return "Bad exchange rate in link.";
    }
  }
  const allowed = new Set(["v", "item", "items", "priceNgn", "sellerName", "note", "rate"]);
  if (Object.keys(d).some((k) => !allowed.has(k))) return "Unexpected field in order details.";
  return undefined;
}

/** A breakdown is optional, but when present it must be well formed and add up. */
function validateLineItems(items: unknown, priceNgn: string): string | undefined {
  if (items === undefined) return undefined;
  if (!Array.isArray(items) || items.length === 0 || items.length > DETAIL_LIMITS.items) {
    return "Bad item list in link.";
  }
  for (const line of items as LineItem[]) {
    if (!line || typeof line !== "object" || Array.isArray(line)) return "Bad item in link.";
    if (Object.keys(line).some((k) => !["name", "qty", "unitNgn"].includes(k))) {
      return "Unexpected field in an item.";
    }
    if (!isShortString(line.name, DETAIL_LIMITS.itemName)) return "Missing or too-long item name.";
  }
  const total = lineItemsTotalKobo(items as LineItem[]);
  if (total === null) return "Bad item quantity or price in link.";
  const [whole, fraction = ""] = priceNgn.split(".");
  const priceKobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (total !== priceKobo) return "The items in this link don't add up to the total.";
  return undefined;
}

function fail(error: string): DecodeResult {
  return { ok: false, error };
}

const isAddr = (v: unknown): v is string => typeof v === "string" && isAddress(v, { strict: false });
const isBytes32 = (v: unknown): v is string => typeof v === "string" && isHex(v) && v.length === 66;
const isUint = (v: unknown) => Number.isSafeInteger(v) && (v as number) >= 0;
const isUint32 = (v: unknown) => isUint(v) && (v as number) <= 0xffffffff;
const isUintString = (v: unknown) => typeof v === "string" && /^\d{1,78}$/.test(v);
const isShortString = (v: unknown, max: number, allowEmpty = false) =>
  typeof v === "string" && v.length <= max && (allowEmpty || v.trim().length > 0);

// base64url over UTF-8, working in both the browser and Node.
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(binary, (c) => c.charCodeAt(0)),
  );
}
