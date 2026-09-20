import type { Address } from "viem";
import { OrderStatus, type Order } from "./invoice";
import { decodeLink, type LinkPayload } from "./link";
import { orderPhase } from "./orderStatus";
import { Mode } from "./terms";

/**
 * The seller's recent sales, kept on their device until the backend dashboard
 * exists. Only the link and the block it was created at are stored; everything
 * else is decoded from the (signed) link.
 */
export type StoredSale = { url: string; fromBlock: string; createdAt: number };
export type RecentSale = StoredSale & { payload: LinkPayload };

const MAX_SALES = 30;
const key = (seller: Address) => `truealert:sales:${seller.toLowerCase()}`;

export type KeyValueStore = Pick<Storage, "getItem" | "setItem">;

export function loadSales(store: KeyValueStore, seller: Address): RecentSale[] {
  let raw: unknown;
  try {
    raw = JSON.parse(store.getItem(key(seller)) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const sales: RecentSale[] = [];
  for (const item of raw as StoredSale[]) {
    if (typeof item?.url !== "string") continue;
    const d = new URL(item.url, "http://x").searchParams.get("d");
    const decoded = d ? decodeLink(d) : undefined;
    // Only keep links that really are this seller's.
    if (decoded?.ok && decoded.payload.terms.seller.toLowerCase() === seller.toLowerCase()) {
      sales.push({ ...item, payload: decoded.payload });
    }
  }
  return sales;
}

export function addSale(store: KeyValueStore, seller: Address, sale: StoredSale) {
  const existing = loadSales(store, seller).map(({ url, fromBlock, createdAt }) => ({ url, fromBlock, createdAt }));
  const next = [sale, ...existing.filter((s) => s.url !== sale.url)].slice(0, MAX_SALES);
  try {
    store.setItem(key(seller), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the sale still works, it just won't be listed.
  }
}

export type SaleBadge = { label: string; tone: "neutral" | "waiting" | "action" | "done" | "problem" };

/** Short status for a sale in the seller's list. */
export function saleBadge(
  payload: LinkPayload,
  chain: { used: boolean; order: Order } | undefined,
  nowSeconds: number,
): SaleBadge {
  if (!chain) return { label: "…", tone: "neutral" };
  const { terms } = payload;
  if (terms.mode === Mode.PayNow) {
    if (chain.used) return { label: "Paid ✓", tone: "done" };
    return nowSeconds > Number(terms.expiry)
      ? { label: "Expired", tone: "neutral" }
      : { label: "Waiting for payment", tone: "waiting" };
  }
  if (chain.order.status === OrderStatus.None) {
    return nowSeconds > Number(terms.expiry)
      ? { label: "Expired", tone: "neutral" }
      : { label: "Waiting for buyer", tone: "waiting" };
  }
  switch (orderPhase(chain.order, nowSeconds)) {
    case "awaiting-shipment":
      return { label: "Paid · ship now", tone: "action" };
    case "ship-overdue":
      return { label: "Ship deadline passed", tone: "problem" };
    case "shipped":
      return { label: "Shipped", tone: "waiting" };
    case "confirm-overdue":
      return { label: "Ready to collect", tone: "action" };
    case "disputed":
    case "arbiter-overdue":
      return { label: "Under review", tone: "problem" };
    case "released":
      return { label: "Completed ✓", tone: "done" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
    case "resolved":
      return { label: "Settled", tone: "neutral" };
  }
}
