"use client";

import { useState } from "react";
import { usePublicClient, useSignTypedData } from "wagmi";
import { env } from "@/config/env";
import { trueAlertAbi } from "@/lib/abi/trueAlert";
import { friendlyError } from "@/lib/errors";
import { encodeLink, type LinkPayload } from "@/lib/link";
import { buildSale, type SaleInput } from "@/lib/sale";
import { termsDomain, termsTypes } from "@/lib/terms";

export type CreatedSale = {
  payload: LinkPayload;
  url: string;
  /** Block at creation, so we only scan logs from here when watching for payment. */
  fromBlock: bigint;
};

/**
 * Builds the terms, asks the seller's wallet to sign them (free, no gas), then
 * has the contract confirm the signature before handing out the link — so a
 * seller never shares a link that buyers would see as "not signed".
 */
export function useCreateSale() {
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function create(input: SaleInput): Promise<CreatedSale | undefined> {
    const contract = env.trueAlertAddress;
    if (!contract || !publicClient) {
      setError("TrueAlert isn't configured for this network yet.");
      return undefined;
    }
    setBusy(true);
    setError(undefined);
    try {
      // Expiry is judged by block time on-chain. Base it on the later of the
      // device clock and the latest block, so a phone with a slow clock can't
      // create links that are already expired.
      const block = await publicClient.getBlock();
      const fromBlock = block.number;
      const now = Math.max(Math.floor(Date.now() / 1000), Number(block.timestamp));
      const { terms, details } = buildSale(input, now);
      const signature = await signTypedDataAsync({
        domain: termsDomain(env.chain.id, contract),
        types: termsTypes,
        primaryType: "Terms",
        message: terms,
      });
      const valid = await publicClient.readContract({
        address: contract,
        abi: trueAlertAbi,
        functionName: "isValidSellerSignature",
        args: [terms, signature],
      });
      if (!valid) {
        setError("Your wallet's signature wasn't accepted. Make sure you're on the right network and try again.");
        return undefined;
      }
      const payload: LinkPayload = { chainId: env.chain.id, contract, terms, signature, details };
      const url = `${window.location.origin}/pay?d=${encodeLink(payload)}`;
      return { payload, url, fromBlock };
    } catch (err) {
      setError(friendlyError(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return { create, busy, error };
}
