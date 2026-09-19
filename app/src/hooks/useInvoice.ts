"use client";

import { useReadContracts } from "wagmi";
import { env } from "@/config/env";
import { findToken } from "@/config/tokens";
import { trueAlertAbi } from "@/lib/abi/trueAlert";
import { deriveInvoiceView, type ChainReads } from "@/lib/invoice";
import type { LinkPayload } from "@/lib/link";
import { useNow } from "./useNow";

/** Live on-chain state of a payment link, polled every few seconds. */
export function useInvoice(payload: LinkPayload) {
  const token = findToken(payload.terms.token);
  const contract = env.trueAlertAddress;
  const sameDeployment =
    payload.chainId === env.chain.id && !!contract && payload.contract === contract;
  const now = useNow();

  const base = { address: payload.contract, abi: trueAlertAbi } as const;
  const { data, isError, refetch } = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...base, functionName: "isValidSellerSignature", args: [payload.terms, payload.signature] },
      { ...base, functionName: "allowedToken", args: [payload.terms.token] },
      { ...base, functionName: "used", args: [payload.terms.id] },
      { ...base, functionName: "getOrder", args: [payload.terms.id] },
      { ...base, functionName: "paused" },
    ],
    query: { enabled: sameDeployment && !!token, refetchInterval: 5_000 },
  });

  const reads: ChainReads | undefined = data && {
    signatureValid: data[0],
    tokenAllowed: data[1],
    used: data[2],
    order: data[3],
    paused: data[4],
  };

  const view = deriveInvoiceView({
    payload,
    appChainId: env.chain.id,
    appContract: contract,
    tokenSupported: !!token,
    reads,
    readsFailed: isError && !data,
    // Before mount we don't know the time; don't claim "expired" yet.
    nowSeconds: now ?? 0,
  });

  return { view, token, now, refetch };
}
