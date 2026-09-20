import Link from "next/link";
import { Card, Shell } from "@/components/Shell";

export default function Home() {
  return (
    <Shell>
      <div className="px-1 pt-6">
        <h1 className="text-3xl font-bold tracking-tight">No more fake alert.</h1>
        <p className="mt-2 text-neutral-600">
          Get paid safely on Electroneum — in person, or in the DMs. Price in naira, settle in
          seconds, and see payment confirmed on your own screen.
        </p>
      </div>

      <Link href="/sell" className="block">
        <Card className="transition-colors hover:bg-neutral-50">
          <p className="text-lg font-semibold">I&apos;m selling →</p>
          <p className="mt-1 text-sm text-neutral-600">
            Create a payment QR for your stall, or a protected link for WhatsApp and Instagram
            orders.
          </p>
        </Card>
      </Link>

      <Card>
        <p className="text-lg font-semibold">I&apos;m buying</p>
        <p className="mt-1 text-sm text-neutral-600">
          Open the payment link your seller sent you. Check it says{" "}
          <span className="font-medium text-green-800">✓ Signed by the seller</span> before you pay.
        </p>
      </Card>

      <div className="px-1 text-sm text-neutral-600">
        <p className="font-medium text-neutral-800">How Protected orders work</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>The buyer pays into escrow — you both see the money is really there.</li>
          <li>You ship, and mark the order shipped.</li>
          <li>The buyer confirms delivery and you&apos;re paid. If they go quiet, you collect anyway.</li>
        </ol>
      </div>
    </Shell>
  );
}
