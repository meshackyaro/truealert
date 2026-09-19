"use client";

import { useState } from "react";
import { txStatusLabel, useContractTx } from "@/hooks/useContractTx";
import { trueAlertAppAbi } from "@/lib/errors";
import type { LinkPayload } from "@/lib/link";

export type OrderCall =
  | "confirmReceived"
  | "reclaim"
  | "extend"
  | "dispute"
  | "resolveTimeout"
  | "markShipped"
  | "claim"
  | "cancel";

/**
 * Sends one order action at a time and knows which one is running, so only
 * that button shows a spinner and the others are disabled.
 */
export function useOrderCall(payload: LinkPayload, onChanged: () => void) {
  const tx = useContractTx();
  const [running, setRunning] = useState<OrderCall>();
  const busyLabel = txStatusLabel[tx.status] ?? "";

  const call = async (functionName: OrderCall, extendBySeconds?: number) => {
    setRunning(functionName);
    const target = { address: payload.contract, abi: trueAlertAppAbi } as const;
    const id = payload.terms.id;
    const hash =
      functionName === "extend"
        ? await tx.send({ ...target, functionName, args: [id, extendBySeconds ?? 48 * 3600] })
        : await tx.send({ ...target, functionName, args: [id] });
    if (hash) onChanged();
  };

  /** Props for the button that triggers `fn`. */
  const state = (fn: OrderCall, idle: string) => ({
    label: tx.busy && running === fn ? busyLabel : idle,
    busy: tx.busy && running === fn,
    disabled: tx.busy && running !== fn,
  });

  return { call, state, tx, running };
}
