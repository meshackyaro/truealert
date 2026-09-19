import { rateService, RateUnavailableError } from "@/lib/server/rates";

/** GET /api/rate → current naira rate (and ETN/USD) for quoting invoices. */
export async function GET() {
  try {
    const quote = await rateService.getQuote();
    return Response.json(quote, {
      headers: { "cache-control": "public, s-maxage=30, stale-while-revalidate=30" },
    });
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      return Response.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }
}
