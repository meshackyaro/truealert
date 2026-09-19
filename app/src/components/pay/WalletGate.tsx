"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { env } from "@/config/env";
import { friendlyError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/Button";

/**
 * Renders `children` only once a wallet is connected on the right chain;
 * otherwise shows the one button needed to get there.
 */
export function WalletGate({ children, prompt }: { children: ReactNode; prompt: string }) {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const { disconnect } = useDisconnect();

  if (!isConnected || !address) {
    return (
      <Button onClick={openConnectModal} busy={isConnecting || isReconnecting}>
        {prompt}
      </Button>
    );
  }

  const account = (
    <p className="flex items-center justify-between px-1 text-xs text-neutral-500">
      <span>Wallet {shortAddress(address)}</span>
      <button type="button" className="underline" onClick={() => disconnect()}>
        Disconnect
      </button>
    </p>
  );

  if (chainId !== env.chain.id) {
    return (
      <div className="space-y-2">
        <Button onClick={() => switchChain({ chainId: env.chain.id })} busy={switching}>
          Switch to {env.chain.name}
        </Button>
        {switchError && <p className="px-1 text-sm text-red-700">{friendlyError(switchError)}</p>}
        {account}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {children}
      {account}
    </div>
  );
}
