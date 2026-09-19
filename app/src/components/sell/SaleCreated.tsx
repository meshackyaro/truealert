"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Shell";
import { findToken } from "@/config/tokens";
import type { CreatedSale } from "@/hooks/useCreateSale";
import { useNow } from "@/hooks/useNow";
import { formatNaira, formatTimeLeft, formatTokenAmount } from "@/lib/format";
import { Mode } from "@/lib/terms";

/** After signing: QR for in-person, share options for DM links. */
export function SaleCreated({ sale, onNew, status }: { sale: CreatedSale; onNew: () => void; status?: ReactNode }) {
  const { terms, details } = sale.payload;
  const token = findToken(terms.token);
  const now = useNow();
  const isProtected = terms.mode === Mode.Protected;
  const amount = token ? `${formatTokenAmount(terms.amount, token.decimals)} ${token.symbol}` : "";

  return (
    <>
      <Card className="text-center">
        <p className="text-sm text-neutral-500">{details.item}</p>
        <p className="text-4xl font-bold tracking-tight">{formatNaira(details.priceNgn)}</p>
        <p className="text-sm text-neutral-600">{amount}</p>

        {!isProtected && (
          <>
            <div className="mx-auto mt-4 w-full max-w-72 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
              <QRCodeSVG value={sale.url} size={512} level="L" className="h-auto w-full" title="Payment QR code" />
            </div>
            <p className="mt-3 text-sm font-medium">Customer scans with their phone camera or wallet</p>
          </>
        )}

        {now !== undefined && (
          <p className="mt-2 text-xs text-neutral-500">
            {now > Number(terms.expiry) ? "This link has expired" : `Price locked · ${formatTimeLeft(terms.expiry, now)}`}
          </p>
        )}
        {status && <div className="mt-4">{status}</div>}
      </Card>

      {isProtected ? <ShareLink sale={sale} amount={amount} /> : <CopyLink url={sale.url} label="Copy payment link" />}

      <Button variant="secondary" onClick={onNew}>
        New sale
      </Button>
    </>
  );
}

function ShareLink({ sale, amount }: { sale: CreatedSale; amount: string }) {
  const { details } = sale.payload;
  const message = `${details.sellerName ? `${details.sellerName}: ` : ""}${details.item}, ${formatNaira(details.priceNgn)} (${amount}).\nPay safely with TrueAlert. Your money is held until you confirm delivery:\n${sale.url}`;
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <Card>
      <h2 className="font-semibold">Send this link to your buyer</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Their money is held safely until they confirm delivery. You&apos;ll ship once they&apos;ve paid.
      </p>
      <div className="mt-3 space-y-2">
        <a
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#25D366] px-4 py-3 font-semibold text-white"
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on WhatsApp
        </a>
        {canShare && (
          <Button variant="secondary" onClick={() => navigator.share({ text: message }).catch(() => {})}>
            Share…
          </Button>
        )}
        <CopyLink url={sale.url} label="Copy link" bare />
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-neutral-600">Show QR code</summary>
        <div className="mx-auto mt-3 w-full max-w-64">
          <QRCodeSVG value={sale.url} size={512} level="L" className="h-auto w-full" title="Payment link QR code" />
        </div>
      </details>
    </Card>
  );
}

function CopyLink({ url, label, bare }: { url: string; label: string; bare?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };
  const button = (
    <Button variant="secondary" onClick={copy}>
      {copied ? "Copied ✓" : label}
    </Button>
  );
  return bare ? button : <div>{button}</div>;
}
