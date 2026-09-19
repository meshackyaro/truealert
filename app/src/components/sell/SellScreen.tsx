"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { WalletGate } from "@/components/pay/WalletGate";
import { useCreateSale, type CreatedSale } from "@/hooks/useCreateSale";
import { Mode } from "@/lib/terms";
import { NewSaleForm } from "./NewSaleForm";
import { SaleCreated } from "./SaleCreated";

/** Seller home: create a sale, then show its QR / share link. */
export function SellScreen() {
  const { isConnected } = useAccount();
  return (
    <>
      {!isConnected && <Intro />}
      <WalletGate prompt="Connect your wallet to sell">
        <Seller />
      </WalletGate>
    </>
  );
}

function Intro() {
  return (
    <div className="px-1">
      <h1 className="text-2xl font-bold tracking-tight">New sale</h1>
      <p className="text-sm text-neutral-600">
        Get paid in person with a QR, or safely in the DMs with a protected link.
      </p>
    </div>
  );
}

function Seller() {
  const { address } = useAccount();
  const { create, busy, error } = useCreateSale();
  const [sale, setSale] = useState<CreatedSale>();

  if (!address) return null;

  if (sale) {
    return <SaleCreated sale={sale} onNew={() => setSale(undefined)} />;
  }

  return (
    <>
      <Intro />
      <NewSaleForm
        seller={address}
        busy={busy}
        submitLabel={(mode) => (busy ? "Sign in your wallet…" : mode === Mode.PayNow ? "Create payment QR" : "Create payment link")}
        onSubmit={async (input) => {
          const created = await create(input);
          if (created) setSale(created);
        }}
      />
      {error && <p className="px-1 text-sm text-red-700">{error}</p>}
    </>
  );
}
