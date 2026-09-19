"use client";

import { useAccount } from "wagmi";
import { WalletGate } from "@/components/pay/WalletGate";
import { Mode } from "@/lib/terms";
import { NewSaleForm } from "./NewSaleForm";

/** Seller home: create a sale. */
export function SellScreen() {
  return (
    <>
      <div className="px-1">
        <h1 className="text-2xl font-bold tracking-tight">New sale</h1>
        <p className="text-sm text-neutral-600">
          Get paid in person with a QR, or safely in the DMs with a protected link.
        </p>
      </div>
      <WalletGate prompt="Connect your wallet to sell">
        <Seller />
      </WalletGate>
    </>
  );
}

function Seller() {
  const { address } = useAccount();
  if (!address) return null;
  return (
    <NewSaleForm
      seller={address}
      busy={false}
      submitLabel={(mode) => (mode === Mode.PayNow ? "Create payment QR" : "Create payment link")}
      onSubmit={() => {}}
    />
  );
}
