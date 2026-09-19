"use client";

import { useCallback, useState } from "react";
import type { Abi, ContractFunctionArgs, ContractFunctionName, Hash } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { friendlyError } from "@/lib/errors";

export type TxStatus = "idle" | "simulating" | "wallet" | "confirming" | "success" | "error";

type Call<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">> = {
  address: `0x${string}`;
  abi: abi;
  functionName: fn;
  args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
  value?: bigint;
};

/**
 * Simulate → sign → wait for receipt, with one status and a human error.
 * Simulating first surfaces contract reverts (expired, already paid, low
 * balance…) as friendly messages before the wallet ever pops up.
 */
export function useContractTx() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [error, setError] = useState<string>();
  const [hash, setHash] = useState<Hash>();

  const send = useCallback(
    async <abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable" | "payable">>(
      call: Call<abi, fn>,
    ): Promise<Hash | undefined> => {
      if (!publicClient || !walletClient || !address) {
        setError("Connect your wallet first.");
        setStatus("error");
        return undefined;
      }
      setError(undefined);
      setHash(undefined);
      try {
        setStatus("simulating");
        const { request } = await publicClient.simulateContract({
          ...(call as Call<Abi, string>),
          account: address,
        } as Parameters<typeof publicClient.simulateContract>[0]);

        setStatus("wallet");
        const txHash = await walletClient.writeContract(request as Parameters<typeof walletClient.writeContract>[0]);
        setHash(txHash);

        setStatus("confirming");
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status !== "success") throw new Error("The transaction failed on-chain.");
        setStatus("success");
        return txHash;
      } catch (err) {
        setError(friendlyError(err));
        setStatus("error");
        return undefined;
      }
    },
    [address, publicClient, walletClient],
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(undefined);
    setHash(undefined);
  }, []);

  const busy = status === "simulating" || status === "wallet" || status === "confirming";
  return { send, status, error, hash, busy, reset };
}

export const txStatusLabel: Record<TxStatus, string | undefined> = {
  idle: undefined,
  simulating: "Checking…",
  wallet: "Confirm in your wallet…",
  confirming: "Waiting for the blockchain…",
  success: undefined,
  error: undefined,
};
