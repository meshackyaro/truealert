/**
 * Naira exchange rates for quoting invoices.
 *
 * - USD→NGN: midpoint of Quidax's live USDT/NGN order book (what stablecoins
 *   actually trade for in naira), falling back to the official rate from
 *   open.er-api.com (updated daily) if Quidax is unavailable.
 * - ETN→USD: CoinGecko.
 *
 * Results are cached for `ttlMs` so every quote in a window gets the same rate
 * and upstream APIs aren't hammered. When a source fails, a recent good value
 * is reused (Quidax up to 5 min, ETN up to 10 min) before falling back, and the
 * quote keeps the time that value was actually fetched.
 *
 * Written as a plain service with injected dependencies (Nest-style) so it's
 * easy to test and to move later.
 */

export type RateQuote = {
  ngnPerUsd: string; // e.g. "1373.28"
  source: "quidax" | "official";
  at: string; // ISO time the rate was fetched
  etnUsd: string | null; // e.g. "0.00114"; null if CoinGecko is down
};

export type RateServiceDeps = {
  fetch: typeof fetch;
  now: () => number;
  ttlMs: number;
  /** How long a Quidax rate may be reused when Quidax fails. */
  staleNgnMs?: number;
  /** How long an ETN/USD price may be reused when CoinGecko fails (it rate-limits). */
  staleEtnMs?: number;
};

export const RATE_SOURCES = {
  quidax: "https://app.quidax.io/api/v1/markets/tickers/usdtngn",
  official: "https://open.er-api.com/v6/latest/USD",
  coingecko: "https://api.coingecko.com/api/v3/simple/price?ids=electroneum&vs_currencies=usd",
} as const;

const TIMEOUT_MS = 5_000;

export class RateUnavailableError extends Error {
  constructor() {
    super("No naira exchange rate available right now");
  }
}

/**
 * Fixed rate for local development and tests: set RATE_FIXED_NGN_PER_USD (and
 * optionally RATE_FIXED_ETN_USD) to work offline and get identical quotes on
 * every run. Never set these in production.
 */
function fixedQuote(now: () => number): RateQuote | undefined {
  const ngnPerUsd = process.env.RATE_FIXED_NGN_PER_USD;
  if (!ngnPerUsd) return undefined;
  return {
    ngnPerUsd,
    source: "quidax",
    at: new Date(now()).toISOString(),
    etnUsd: process.env.RATE_FIXED_ETN_USD ?? null,
  };
}

export function createRateService(deps: RateServiceDeps) {
  const staleNgnMs = deps.staleNgnMs ?? 5 * 60_000;
  const staleEtnMs = deps.staleEtnMs ?? 10 * 60_000;
  let cached: { quote: RateQuote; expires: number } | undefined;
  let inflight: Promise<RateQuote> | undefined;
  let lastQuidax: { ngnPerUsd: string; at: string; atMs: number } | undefined;
  let lastEtn: { usd: string; atMs: number } | undefined;

  async function getJson(url: string): Promise<unknown> {
    const res = await deps.fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res.json();
  }

  async function quidaxMid(): Promise<number> {
    const body = (await getJson(RATE_SOURCES.quidax)) as {
      data?: { ticker?: { buy?: string; sell?: string } };
    };
    const bid = Number(body.data?.ticker?.buy);
    const ask = Number(body.data?.ticker?.sell);
    if (!(bid > 0) || !(ask > 0) || ask < bid || ask / bid > 1.05) {
      throw new Error("Quidax ticker missing or implausible");
    }
    return (bid + ask) / 2;
  }

  async function official(): Promise<number> {
    const body = (await getJson(RATE_SOURCES.official)) as { rates?: { NGN?: number } };
    const ngn = Number(body.rates?.NGN);
    if (!(ngn > 0)) throw new Error("Official NGN rate missing");
    return ngn;
  }

  async function etnUsd(): Promise<number | null> {
    try {
      const body = (await getJson(RATE_SOURCES.coingecko)) as { electroneum?: { usd?: number } };
      const usd = Number(body.electroneum?.usd);
      return usd > 0 ? usd : null;
    } catch {
      return null;
    }
  }

  async function fetchQuote(): Promise<RateQuote> {
    const now = deps.now();
    const at = new Date(now).toISOString();
    const [primary, etn] = await Promise.allSettled([quidaxMid(), etnUsd()]);

    let etnValue: string | null = null;
    if (etn.status === "fulfilled" && etn.value !== null) {
      etnValue = String(etn.value);
      lastEtn = { usd: etnValue, atMs: now };
    } else if (lastEtn && now - lastEtn.atMs <= staleEtnMs) {
      etnValue = lastEtn.usd;
    }

    if (primary.status === "fulfilled") {
      const ngnPerUsd = primary.value.toFixed(2);
      lastQuidax = { ngnPerUsd, at, atMs: now };
      return { ngnPerUsd, source: "quidax", at, etnUsd: etnValue };
    }
    if (lastQuidax && now - lastQuidax.atMs <= staleNgnMs) {
      // Recent market rate beats the daily official rate; keep its real time.
      return { ngnPerUsd: lastQuidax.ngnPerUsd, source: "quidax", at: lastQuidax.at, etnUsd: etnValue };
    }
    try {
      return { ngnPerUsd: (await official()).toFixed(2), source: "official", at, etnUsd: etnValue };
    } catch {
      throw new RateUnavailableError();
    }
  }

  return {
    /** The current quote, from cache when fresh. Concurrent callers share one fetch. */
    async getQuote(): Promise<RateQuote> {
      const fixed = fixedQuote(deps.now);
      if (fixed) return fixed;
      if (cached && cached.expires > deps.now()) return cached.quote;
      inflight ??= fetchQuote()
        .then((quote) => {
          cached = { quote, expires: deps.now() + deps.ttlMs };
          return quote;
        })
        .finally(() => {
          inflight = undefined;
        });
      return inflight;
    },
  };
}

export type RateService = ReturnType<typeof createRateService>;

/** App-wide instance (one cache per server process). */
export const rateService = createRateService({ fetch, now: Date.now, ttlMs: 60_000 });
