"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { WalletGate } from "@/components/pay/WalletGate";
import { useChainNow } from "@/hooks/useChainNow";
import { useRate } from "@/hooks/useRate";
import { useCreateSale, type CreatedSale } from "@/hooks/useCreateSale";
import { addSale, loadSales, type RecentSale } from "@/lib/recentSales";
import type { RateQuote } from "@/lib/server/rates";
import { Mode } from "@/lib/terms";
import { NewSaleForm } from "./NewSaleForm";
import { RecentSales } from "./RecentSales";
import { SaleCreated } from "./SaleCreated";

/** Seller home: create a sale, then show its QR / share link, plus recent sales. */
export function SellScreen({ initialRate }: { initialRate?: RateQuote }) {
  const { isConnected } = useAccount();
  // Warm the rate query here: the form mounts only after the wallet connects,
  // which would otherwise delay the first fetch by seconds.
  useRate(initialRate);
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
      <p className="text-sm text-muted">
        Get paid in person with a QR, or safely in the DMs with a protected link.
      </p>
    </div>
  );
}

function Seller() {
  const { address } = useAccount();
  const { create, busy, error } = useCreateSale();
  const [sale, setSale] = useState<CreatedSale>();
  const now = useChainNow();
  // Sales live in this device's storage; the list only renders once connected.
  const [sales, setSales] = useState<RecentSale[]>(() => (address ? loadSales(localStorage, address) : []));

  if (!address) return null;

  if (sale) {
    return <SaleCreated sale={sale} onBack={() => setSale(undefined)} />;
  }

  return (
    <>
      <Intro />
      <NewSaleForm
        seller={address}
        busy={busy}
        submitLabel={(mode) =>
          busy ? "Sign in your wallet…" : mode === Mode.PayNow ? "Create payment QR" : "Create payment link"
        }
        onSubmit={async (input) => {
          const created = await create(input);
          if (!created) return;
          addSale(localStorage, address, {
            url: created.url,
            fromBlock: created.fromBlock.toString(),
            createdAt: Date.now(),
          });
          setSales(loadSales(localStorage, address));
          setSale(created);
        }}
      />
      {error && <p className="px-1 text-sm text-danger">{error}</p>}
      <RecentSales
        sales={sales}
        now={now}
        onOpen={(recent) =>
          setSale({ payload: recent.payload, url: recent.url, fromBlock: BigInt(recent.fromBlock) })
        }
      />
    </>
  );
}
