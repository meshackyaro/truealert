import type { Metadata } from "next";
import { PayScreen } from "@/components/pay/PayScreen";
import { Shell } from "@/components/Shell";
import { formatNaira } from "@/lib/format";
import { decodeLink } from "@/lib/link";
import { Mode } from "@/lib/terms";

function encodedParam(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export async function generateMetadata({ searchParams }: PageProps<"/pay">): Promise<Metadata> {
  const result = decodeLink(encodedParam((await searchParams).d));
  if (!result.ok) return { title: "Pay · TrueAlert" };
  const { details, terms } = result.payload;
  const price = formatNaira(details.priceNgn);
  const kind = terms.mode === Mode.Protected ? "Protected payment" : "Payment";
  return {
    title: `Pay ${price} · ${details.item} · TrueAlert`,
    description: `${kind} to ${details.sellerName ?? "a seller"} for ${details.item}, ${price}. Secured on Electroneum.`,
    robots: { index: false },
  };
}

export default async function PayPage({ searchParams }: PageProps<"/pay">) {
  const encoded = encodedParam((await searchParams).d);
  return (
    <Shell>
      <PayScreen encoded={encoded} />
    </Shell>
  );
}
