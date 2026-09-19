"use client";

import { erc20Abi, type Hash } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Shell";
import { env } from "@/config/env";
import { faucetUrl } from "@/config/chains";
import type { Token } from "@/config/tokens";
import { txStatusLabel, useContractTx } from "@/hooks/useContractTx";
import { useGasBalance, useTokenBalance } from "@/hooks/useTokenBalance";
import { mockUsdcAbi } from "@/lib/abi/mockUsdc";
import { trueAlertAppAbi } from "@/lib/errors";
import { formatNaira, formatTokenAmount, shortAddress } from "@/lib/format";
import { isReservedForSomeoneElse } from "@/lib/invoice";
import type { LinkPayload } from "@/lib/link";
import { Mode } from "@/lib/terms";

type Props = {
  payload: LinkPayload;
  token: Token;
  onDone: (hash: Hash) => void;
};

/**
 * Approve (ERC-20 only, exact amount) then pay / fund. Pay-now sends funds
 * straight to the seller; Protected locks them in escrow.
 */
export function PaymentAction({ payload, token, onDone }: Props) {
  const { terms, details } = payload;
  const { address } = useAccount();
  const approveTx = useContractTx();
  const mintTx = useContractTx();
  const payTx = useContractTx();
  const balance = useTokenBalance(token, address);
  const gas = useGasBalance(address);

  const allowance = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, payload.contract] : undefined,
    query: { enabled: !!address && !token.native },
  });

  if (isReservedForSomeoneElse(payload, address)) {
    return (
      <Notice tone="warning" title="This link is reserved for another wallet">
        The seller made it for {shortAddress(terms.buyer)}. Connect that wallet, or ask the seller
        for a new link.
      </Notice>
    );
  }

  const amountLabel = `${formatTokenAmount(terms.amount, token.decimals)} ${token.symbol}`;
  const isProtected = terms.mode === Mode.Protected;
  const notEnough = balance.value !== undefined && balance.value < terms.amount;
  const noGas = gas === 0n;
  const needsApproval = !token.native && (allowance.data ?? 0n) < terms.amount;

  // Testnet only: MockUSDC lets anyone mint up to 10,000 per call.
  const canMintTestUsdc = env.chainKey !== "mainnet" && !token.native;
  const mintTestUsdc = async () => {
    if (!address) return;
    const unit = 10n ** BigInt(token.decimals);
    const wanted = terms.amount + 100n * unit; // the invoice plus some spare
    const maxMint = 10_000n * unit;
    const hash = await mintTx.send({
      address: token.address,
      abi: mockUsdcAbi,
      functionName: "mint",
      args: [address, wanted < maxMint ? wanted : maxMint],
    });
    if (hash) await balance.refetch();
  };

  const approve = async () => {
    const hash = await approveTx.send({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [payload.contract, terms.amount],
    });
    if (hash) await allowance.refetch();
  };

  const pay = async () => {
    const common = {
      address: payload.contract,
      abi: trueAlertAppAbi,
      args: [terms, payload.signature],
      value: token.native ? terms.amount : undefined,
    } as const;
    const hash = isProtected
      ? await payTx.send({ ...common, functionName: "fund" })
      : await payTx.send({ ...common, functionName: "payInvoice" });
    if (hash) onDone(hash);
  };

  const activeTx = needsApproval ? approveTx : payTx;

  return (
    <div className="space-y-3">
      <p className={`px-1 text-sm ${notEnough ? "text-red-700" : "text-neutral-600"}`}>
        {balance.value !== undefined &&
          `Your balance: ${formatTokenAmount(balance.value, token.decimals)} ${token.symbol}`}
        {notEnough && " (not enough for this payment)"}
      </p>

      {notEnough && canMintTestUsdc && (
        <Button variant="secondary" onClick={mintTestUsdc} busy={mintTx.busy}>
          {mintTx.busy ? txStatusLabel[mintTx.status] : "Get free test USDC"}
        </Button>
      )}
      {mintTx.error && <p className="px-1 text-sm text-red-700">{mintTx.error}</p>}

      {noGas && (
        <Notice tone="warning" title="You need a little ETN for the network fee">
          {env.chainKey === "mainnet" ? (
            "Add a small amount of ETN to this wallet, then try again."
          ) : (
            <>
              Get free test ETN from the{" "}
              <a className="underline" href={faucetUrl} target="_blank" rel="noreferrer">
                Electroneum faucet
              </a>
              .
            </>
          )}
        </Notice>
      )}

      {needsApproval ? (
        <Button onClick={approve} busy={approveTx.busy} disabled={notEnough || noGas}>
          {approveTx.busy ? txStatusLabel[approveTx.status] : `Allow ${amountLabel}`}
        </Button>
      ) : (
        <Button onClick={pay} busy={payTx.busy} disabled={notEnough || noGas}>
          {payTx.busy
            ? txStatusLabel[payTx.status]
            : `${isProtected ? "Pay safely" : "Pay"} ${formatNaira(details.priceNgn)} · ${amountLabel}`}
        </Button>
      )}

      {needsApproval && !approveTx.busy && (
        <p className="px-1 text-xs text-neutral-500">
          Step 1 of 2: let TrueAlert take exactly {amountLabel}, nothing more. Then you pay.
        </p>
      )}
      {activeTx.error && <p className="px-1 text-sm text-red-700">{activeTx.error}</p>}
    </div>
  );
}
