import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { SellScreen } from "@/components/sell/SellScreen";

export const metadata: Metadata = {
  title: "Sell",
  description: "Create a payment QR or a protected payment link. No more fake alert.",
};

export default function SellPage() {
  return (
    <Shell>
      <SellScreen />
    </Shell>
  );
}
