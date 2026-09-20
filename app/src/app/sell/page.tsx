import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { SellScreen } from "@/components/sell/SellScreen";
import { rateService } from "@/lib/server/rates";

export const metadata: Metadata = {
  title: "Sell",
  description: "Create a payment QR or a protected payment link. No more fake alert.",
};

export default async function SellPage() {
  // Quote the rate here so the form can price a sale on first paint; the
  // service caches for 60s, so this is usually instant.
  const initialRate = await rateService.getQuote().catch(() => undefined);
  return (
    <Shell>
      <SellScreen initialRate={initialRate} />
    </Shell>
  );
}
