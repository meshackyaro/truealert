import { describe, expect, it, vi } from "vitest";
import { createRateService, RATE_SOURCES, RateUnavailableError } from "./rates";

type Responses = Partial<Record<keyof typeof RATE_SOURCES, unknown | Error>>;

function fakeFetch(responses: Responses) {
  const calls: string[] = [];
  const fn = vi.fn(async (url: string | URL | Request) => {
    const key = (Object.keys(RATE_SOURCES) as (keyof typeof RATE_SOURCES)[]).find(
      (k) => RATE_SOURCES[k] === String(url),
    )!;
    calls.push(key);
    const body = responses[key];
    if (body === undefined || body instanceof Error) throw body ?? new Error("offline");
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

const quidax = { data: { ticker: { buy: "1371.21", sell: "1375.34" } } };
const official = { rates: { NGN: 1330.27 } };
const coingecko = { electroneum: { usd: 0.00114 } };

describe("rate service", () => {
  it("uses the Quidax USDT/NGN midpoint plus ETN/USD", async () => {
    const { fetch } = fakeFetch({ quidax, official, coingecko });
    const svc = createRateService({ fetch, now: () => 1_790_000_000_000, ttlMs: 60_000 });
    expect(await svc.getQuote()).toEqual({
      ngnPerUsd: "1373.28",
      source: "quidax",
      at: new Date(1_790_000_000_000).toISOString(),
      etnUsd: "0.00114",
    });
  });

  it("falls back to the official rate when Quidax is down", async () => {
    const { fetch } = fakeFetch({ quidax: new Error("down"), official, coingecko });
    const svc = createRateService({ fetch, now: () => 0, ttlMs: 60_000 });
    const q = await svc.getQuote();
    expect(q.source).toBe("official");
    expect(q.ngnPerUsd).toBe("1330.27");
  });

  it("rejects an implausible Quidax book (crossed or >5% spread)", async () => {
    const { fetch } = fakeFetch({
      quidax: { data: { ticker: { buy: "1500", sell: "1300" } } },
      official,
    });
    const svc = createRateService({ fetch, now: () => 0, ttlMs: 60_000 });
    expect((await svc.getQuote()).source).toBe("official");
  });

  it("still quotes naira when CoinGecko is down (ETN unavailable)", async () => {
    const { fetch } = fakeFetch({ quidax, coingecko: new Error("429") });
    const svc = createRateService({ fetch, now: () => 0, ttlMs: 60_000 });
    expect((await svc.getQuote()).etnUsd).toBeNull();
  });

  it("throws when no naira rate is available at all", async () => {
    const { fetch } = fakeFetch({});
    const svc = createRateService({ fetch, now: () => 0, ttlMs: 60_000 });
    await expect(svc.getQuote()).rejects.toBeInstanceOf(RateUnavailableError);
  });

  it("caches for the TTL, then refetches", async () => {
    let now = 0;
    const { fetch, calls } = fakeFetch({ quidax, coingecko });
    const svc = createRateService({ fetch, now: () => now, ttlMs: 60_000 });
    await svc.getQuote();
    now = 59_999;
    await svc.getQuote();
    expect(calls.filter((c) => c === "quidax")).toHaveLength(1);
    now = 60_001;
    await svc.getQuote();
    expect(calls.filter((c) => c === "quidax")).toHaveLength(2);
  });

  it("reuses a recent Quidax rate (with its real time) when Quidax fails", async () => {
    let now = 0;
    const responses: Responses = { quidax, official, coingecko };
    const { fetch } = fakeFetch(responses);
    const svc = createRateService({ fetch, now: () => now, ttlMs: 60_000 });
    const first = await svc.getQuote();
    responses.quidax = new Error("down");
    now = 4 * 60_000;
    const second = await svc.getQuote();
    expect(second).toMatchObject({ ngnPerUsd: "1373.28", source: "quidax", at: first.at });
    now = 6 * 60_000; // older than 5 minutes: fall back to official
    expect((await svc.getQuote()).source).toBe("official");
  });

  it("reuses a recent ETN price when CoinGecko rate-limits", async () => {
    let now = 0;
    const responses: Responses = { quidax, coingecko };
    const { fetch } = fakeFetch(responses);
    const svc = createRateService({ fetch, now: () => now, ttlMs: 60_000 });
    await svc.getQuote();
    responses.coingecko = new Error("429");
    now = 9 * 60_000;
    expect((await svc.getQuote()).etnUsd).toBe("0.00114");
    now = 21 * 60_000;
    expect((await svc.getQuote()).etnUsd).toBeNull();
  });

  it("shares one upstream fetch between concurrent callers", async () => {
    const { fetch, calls } = fakeFetch({ quidax, coingecko });
    const svc = createRateService({ fetch, now: () => 0, ttlMs: 60_000 });
    await Promise.all([svc.getQuote(), svc.getQuote(), svc.getQuote()]);
    expect(calls.filter((c) => c === "quidax")).toHaveLength(1);
  });
});
