import Link from "next/link";
import { Card, Shell } from "@/components/Shell";

export default function Home() {
  return (
    <Shell>
      <div className="px-1 pt-2 sm:pt-6">
        <h1 className="text-display font-bold">No more fake alert.</h1>
        <p className="mt-2 text-muted">
          Get paid safely on Electroneum — in person, or in the DMs. Price in naira, settle in
          seconds, and see payment confirmed on your own screen.
        </p>
      </div>

      <Link href="/sell" className="block">
        <Card className="p-5 transition-colors hover:bg-surface-muted sm:p-6">
          <p className="flex items-center justify-between text-lg font-semibold">
            I&apos;m selling <span aria-hidden>→</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Create a payment QR for your stall, or a protected link for WhatsApp and Instagram
            orders.
          </p>
        </Card>
      </Link>

      <Card>
        <p className="text-lg font-semibold">I&apos;m buying</p>
        <p className="mt-1 text-sm text-muted">
          Open the payment link your seller sent you. Check it says{" "}
          <span className="font-medium text-success">✓ Signed by the seller</span> before you pay.
        </p>
      </Card>

      <div className="px-1 text-sm text-muted">
        <p className="font-medium text-fg">How Protected orders work</p>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          <li>The buyer pays into escrow — you both see the money is really there.</li>
          <li>You ship, and mark the order shipped.</li>
          <li>The buyer confirms delivery and you&apos;re paid. If they go quiet, you collect anyway.</li>
        </ol>
      </div>
    </Shell>
  );
}
