import { bytesToHex, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import type { Token } from "@/config/tokens";
import { DETAIL_LIMITS, hashOrderDetails, Mode, type OrderDetails, type Terms } from "./terms";

const HOUR = 3_600;
const DAY = 24 * HOUR;

/** Mirrors the contract's window bounds. */
export const WINDOW_BOUNDS = {
  ship: { min: 1 * HOUR, max: 14 * DAY },
  confirm: { min: 12 * HOUR, max: 14 * DAY },
} as const;

export const DELIVERY_PRESETS = {
  sameDay: { label: "Same day / Lagos", shipWindow: 24 * HOUR, confirmWindow: 24 * HOUR },
  interstate: { label: "Interstate", shipWindow: 3 * DAY, confirmWindow: 5 * DAY },
} as const;
export type DeliveryPreset = keyof typeof DELIVERY_PRESETS;

/** How long a link stays payable: short for pay-now (rate freshness), longer for DM links. */
export const LINK_LIFETIME = { payNow: 15 * 60, protected: 48 * HOUR } as const;

export type RateInput = { ngnPerUsd: string; etnUsd: string | null };

/**
 * Token amount for a naira price, rounded UP to 0.01 of the token so the
 * amount the buyer sees ("10.93 USDC") is exactly what they pay, and the
 * seller never receives less than the naira price. Null if unquotable.
 */
export function quoteAmount(priceNgn: string, rate: RateInput, token: Token): bigint | null {
  let priceKobo: bigint, rateKobo: bigint;
  try {
    priceKobo = parseUnits(priceNgn, 2);
    rateKobo = parseUnits(rate.ngnPerUsd, 2);
  } catch {
    return null;
  }
  if (priceKobo <= 0n || rateKobo <= 0n) return null;

  const hundredthUnit = 10n ** BigInt(token.decimals - 2); // units in 0.01 token
  if (!token.native) {
    // Stablecoin ≈ USD: cents = ceil(price / rate × 100)
    return ceilDiv(priceKobo * 100n, rateKobo) * hundredthUnit;
  }
  if (!rate.etnUsd) return null;
  let etnUsdScaled: bigint;
  try {
    etnUsdScaled = parseUnits(rate.etnUsd, 12);
  } catch {
    return null;
  }
  if (etnUsdScaled <= 0n) return null;
  // hundredths of ETN = ceil(price / rate / etnUsd × 100)
  return ceilDiv(priceKobo * 100n * 10n ** 12n, rateKobo * etnUsdScaled) * hundredthUnit;
}

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

export type SaleInput = {
  mode: Mode;
  seller: Address;
  token: Token;
  priceNgn: string;
  item: string;
  sellerName?: string;
  note?: string;
  rate: RateInput & { source: "quidax" | "official"; at: string };
  /** Protected only */
  delivery?: { preset: DeliveryPreset } | { shipHours: number; confirmHours: number };
  arbiter?: Address;
  lockToBuyer?: Address;
};

export type SaleErrors = Partial<Record<"priceNgn" | "item" | "sellerName" | "note" | "delivery" | "rate" | "lockToBuyer", string>>;

export function deliveryWindows(delivery: SaleInput["delivery"]): { shipWindow: number; confirmWindow: number } {
  if (!delivery) return DELIVERY_PRESETS.sameDay;
  if ("preset" in delivery) return DELIVERY_PRESETS[delivery.preset];
  return { shipWindow: Math.round(delivery.shipHours * HOUR), confirmWindow: Math.round(delivery.confirmHours * HOUR) };
}

/** Form-level validation with messages for the seller. Empty object = valid. */
export function validateSale(input: SaleInput): SaleErrors {
  const errors: SaleErrors = {};
  if (!/^\d+(\.\d{1,2})?$/.test(input.priceNgn) || Number(input.priceNgn) <= 0) {
    errors.priceNgn = "Enter a price in naira, e.g. 15000";
  } else if (Number(input.priceNgn) > 50_000_000) {
    errors.priceNgn = "That's over ₦50,000,000. Please check the price.";
  }
  const item = input.item.trim();
  if (!item) errors.item = "Say what you're selling";
  else if (item.length > DETAIL_LIMITS.item) errors.item = `Keep it under ${DETAIL_LIMITS.item} characters`;
  if ((input.sellerName?.trim().length ?? 0) > DETAIL_LIMITS.sellerName) {
    errors.sellerName = `Keep it under ${DETAIL_LIMITS.sellerName} characters`;
  }
  if ((input.note?.length ?? 0) > DETAIL_LIMITS.note) errors.note = `Keep it under ${DETAIL_LIMITS.note} characters`;
  if (input.mode === Mode.Protected) {
    const { shipWindow, confirmWindow } = deliveryWindows(input.delivery);
    if (
      shipWindow < WINDOW_BOUNDS.ship.min ||
      shipWindow > WINDOW_BOUNDS.ship.max ||
      confirmWindow < WINDOW_BOUNDS.confirm.min ||
      confirmWindow > WINDOW_BOUNDS.confirm.max
    ) {
      errors.delivery = "Ship time must be 1 hour to 14 days; confirm time 12 hours to 14 days";
    }
  }
  if (input.lockToBuyer && input.lockToBuyer.toLowerCase() === input.seller.toLowerCase()) {
    errors.lockToBuyer = "That's your own wallet";
  }
  if (!errors.priceNgn && quoteAmount(input.priceNgn, input.rate, input.token) === null) {
    errors.rate = input.token.native
      ? "ETN price unavailable right now. Try USDC or again shortly."
      : "Exchange rate unavailable right now. Try again shortly.";
  }
  return errors;
}

export function randomTermsId(): Hex {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** Everything the seller signs, plus the details the link carries. */
export function buildSale(input: SaleInput, nowSeconds: number, id: Hex = randomTermsId()) {
  const isProtected = input.mode === Mode.Protected;
  const details: OrderDetails = {
    v: 1,
    item: input.item.trim(),
    priceNgn: input.priceNgn,
    ...(input.sellerName?.trim() ? { sellerName: input.sellerName.trim() } : {}),
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    rate: { ngnPerUsd: input.rate.ngnPerUsd, source: input.rate.source, at: input.rate.at },
  };
  const amount = quoteAmount(input.priceNgn, input.rate, input.token);
  if (amount === null) throw new Error("Can't quote this sale");
  const windows = isProtected ? deliveryWindows(input.delivery) : { shipWindow: 0, confirmWindow: 0 };
  const terms: Terms = {
    id,
    mode: input.mode,
    seller: input.seller,
    token: input.token.address,
    amount,
    expiry: BigInt(nowSeconds + (isProtected ? LINK_LIFETIME.protected : LINK_LIFETIME.payNow)),
    buyer: input.lockToBuyer ?? zeroAddress,
    shipWindow: windows.shipWindow,
    confirmWindow: windows.confirmWindow,
    arbiter: isProtected ? (input.arbiter ?? zeroAddress) : zeroAddress,
    ref: hashOrderDetails(details),
  };
  return { terms, details };
}
