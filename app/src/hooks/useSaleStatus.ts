"use client";

import { useEffect, useState } from "react";
import type { Address, Hash } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import type { CreatedSale } from "@/hooks/useCreateSale";
import { trueAlertAbi } from "@/lib/abi/trueAlert";
import { OrderStatus, type Order } from "@/lib/invoice";
import { Mode } from "@/lib/terms";

export type SaleStatus =
  | { kind: "waiting" }
  | { kind: "paid"; buyer?: Address; txHash?: Hash } // pay-now invoice paid
  | { kind: "funded"; order: Order }; // protected order exists (any status)

/**
 * Watches a sale the seller just created, straight from the chain: the seller's
 * own screen is the proof of payment, never the buyer's.
 */
export function useSaleStatus(sale: CreatedSale): SaleStatus {
  const { terms, contract } = { terms: sale.payload.terms, contract: sale.payload.contract };
  const publicClient = usePublicClient();
  const [paidTx, setPaidTx] = useState<{ buyer: Address; txHash: Hash }>();

  const base = { address: contract, abi: trueAlertAbi } as const;
  const { data } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...base, functionName: "used", args: [terms.id] },
      { ...base, functionName: "getOrder", args: [terms.id] },
    ],
    query: { refetchInterval: 3_000 },
  });
  const used = data?.[0] ?? false;
  const order = data?.[1];

  // Once paid, look up who paid and in which transaction (only since creation).
  useEffect(() => {
    if (!used || terms.mode !== Mode.PayNow || paidTx || !publicClient) return;
    let cancelled = false;
    publicClient
      .getContractEvents({
        address: contract,
        abi: trueAlertAbi,
        eventName: "InvoicePaid",
        args: { id: terms.id },
        fromBlock: sale.fromBlock,
      })
      .then((logs) => {
        const log = logs.at(-1);
        if (!cancelled && log?.args.buyer) setPaidTx({ buyer: log.args.buyer, txHash: log.transactionHash });
      })
      .catch(() => {}); // details are a nicety; "paid" already came from used()
    return () => {
      cancelled = true;
    };
  }, [used, terms.mode, terms.id, contract, sale.fromBlock, paidTx, publicClient]);

  if (terms.mode === Mode.Protected && order && order.status !== OrderStatus.None) {
    return { kind: "funded", order };
  }
  if (used) return { kind: "paid", ...paidTx };
  return { kind: "waiting" };
}
