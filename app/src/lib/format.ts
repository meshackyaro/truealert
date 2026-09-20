import { formatUnits } from "viem";

function nairaFormat(fractionDigits: 0 | 2) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** "15000" → "₦15,000"; "2500.5" → "₦2,500.50" (kobo always shown in pairs). */
export function formatNaira(priceNgn: string | number): string {
  const value = Number(priceNgn);
  return nairaFormat(Number.isInteger(value) ? 0 : 2).format(value);
}

/**
 * Token amount for display, trimmed to a sensible precision:
 * 10922754n (USDC, 6 dp) → "10.92"; 9_600.123e18 (ETN) → "9,600.12".
 */
export function formatTokenAmount(amount: bigint, decimals: number, maxFraction = 2): string {
  const [whole, fraction = ""] = formatUnits(amount, decimals).split(".");
  const wholeGrouped = BigInt(whole).toLocaleString("en-US");
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, "");
  // Never show a non-zero amount as "0".
  if (whole === "0" && !trimmed && amount > 0n) return `<0.${"0".repeat(maxFraction - 1)}1`;
  return trimmed ? `${wholeGrouped}.${trimmed}` : wholeGrouped;
}

/** 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 → 0x7099…79C8 */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** 86400 → "24 hours", 259200 → "3 days", 5400 → "1 hour 30 min" */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 min";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days >= 2 && hours === 0) return `${days} days`;
  if (days >= 1) {
    const totalHours = days * 24 + hours;
    return hours === 0 && days === 1 ? "24 hours" : `${totalHours} hours`;
  }
  const parts = [];
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  if (minutes) parts.push(`${minutes} min`);
  return parts.join(" ") || "under a minute";
}

/** Time left until `deadline` (unix seconds) from `now`, e.g. "14 min left". */
export function formatTimeLeft(deadline: bigint | number, nowSeconds: number): string {
  const left = Number(deadline) - nowSeconds;
  if (left <= 0) return "expired";
  if (left < 60) return "under a minute left";
  return `${formatDuration(left)} left`;
}

/** Local time like "2:14 pm" (Lagos time zone). */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

/** Local date-time like "Sat 20 Sep, 2:14 pm" (Lagos time zone). */
export function formatDeadline(unixSeconds: bigint | number): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}
