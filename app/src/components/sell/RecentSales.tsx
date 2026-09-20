"use client";

import { useReadContracts } from "wagmi";
import { Card } from "@/components/Shell";
import { findToken } from "@/config/tokens";
import { trueAlertAbi } from "@/lib/abi/trueAlert";
import { formatDeadline, formatNaira, formatTokenAmount } from "@/lib/format";
import type { Order } from "@/lib/invoice";
import { saleBadge, type RecentSale, type SaleBadge } from "@/lib/recentSales";
import { Mode } from "@/lib/terms";

const toneClasses: Record<SaleBadge["tone"], string> = {
  neutral: "bg-neutral-100 text-neutral-600",
  waiting: "bg-amber-100 text-amber-800",
  action: "bg-green-100 text-green-800",
  done: "bg-green-600 text-white",
  problem: "bg-red-100 text-red-800",
};

/** The seller's recent sales on this device, with live status from the chain. */
export function RecentSales({
  sales,
  now,
  onOpen,
}: {
  sales: RecentSale[];
  now: number | undefined;
  onOpen: (sale: RecentSale) => void;
}) {
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: sales.flatMap((sale) => [
      { address: sale.payload.contract, abi: trueAlertAbi, functionName: "used", args: [sale.payload.terms.id] } as const,
      { address: sale.payload.contract, abi: trueAlertAbi, functionName: "getOrder", args: [sale.payload.terms.id] } as const,
    ]),
    query: { enabled: sales.length > 0, refetchInterval: 10_000 },
  });

  if (sales.length === 0) return null;

  return (
    <Card className="p-0">
      <h2 className="px-5 pt-4 text-sm font-semibold text-neutral-700">Recent sales</h2>
      <ul className="mt-2 divide-y divide-neutral-100">
        {sales.map((sale, i) => {
          const { terms, details } = sale.payload;
          const token = findToken(terms.token);
          const chain = data ? { used: data[i * 2] as boolean, order: data[i * 2 + 1] as Order } : undefined;
          const badge = saleBadge(sale.payload, chain, now ?? 0);
          return (
            <li key={sale.url}>
              <button
                type="button"
                onClick={() => onOpen(sale)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-neutral-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{details.item}</span>
                  <span className="block text-xs text-neutral-500">
                    {formatNaira(details.priceNgn)}
                    {token && ` · ${formatTokenAmount(terms.amount, token.decimals)} ${token.symbol}`}
                    {terms.mode === Mode.Protected && " · Protected"}
                    {" · "}
                    {formatDeadline(Math.floor(sale.createdAt / 1000))}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${toneClasses[badge.tone]}`}>
                  {badge.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
