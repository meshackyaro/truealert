"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { env } from "@/config/env";
import { friendlyError } from "@/lib/errors";
import { shortAddress } from "@/lib/format";
import { Button } from "@/components/Button";
import { useHydrated } from "@/hooks/useHydrated";

/**
 * Renders `children` only once a wallet is connected on the right chain;
 * otherwise shows the one button needed to get there.
 */
export function WalletGate({ children, prompt }: { children: ReactNode; prompt: string }) {
  const { address, chainId, isConnected, isConnecting, isReconnecting } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching, error: switchError } = useSwitchChain();
  const { disconnect } = useDisconnect();
  const hydrated = useHydrated();

  if (!isConnected || !address) {
    // Before hydration a tap does nothing, and RainbowKit only provides
    // openConnectModal once wallets are ready (with WalletConnect that takes a
    // few seconds on slow links). Show loading rather than a dead button.
    const ready = hydrated && !!openConnectModal;
    return (
      <Button onClick={openConnectModal} busy={isConnecting || isReconnecting || !ready}>
        {ready ? prompt : "Loading wallets…"}
      </Button>
    );
  }

  const account = (
    <p className="flex min-h-11 items-center justify-between px-1 text-xs text-muted">
      <span>Wallet {shortAddress(address)}</span>
      <button
        type="button"
        className="-mr-2 flex min-h-11 items-center rounded-lg px-2 underline hover:text-fg"
        onClick={() => disconnect()}
      >
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
        {switchError && <p className="px-1 text-sm text-danger">{friendlyError(switchError)}</p>}
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
