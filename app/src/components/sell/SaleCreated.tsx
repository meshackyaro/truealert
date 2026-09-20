"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Shell";
import { findToken } from "@/config/tokens";
import { useChainNow } from "@/hooks/useChainNow";
import type { CreatedSale } from "@/hooks/useCreateSale";
import { useSaleStatus } from "@/hooks/useSaleStatus";
import { formatNaira, formatTimeLeft, formatTokenAmount } from "@/lib/format";
import { Mode } from "@/lib/terms";
import { SaleStatusBanner } from "./SaleStatusBanner";

/**
 * After signing: QR for in-person, share options for DM links, and the live
 * payment status. Once paid, the QR and share options go away so nobody pays
 * twice.
 */
export function SaleCreated({ sale, onBack }: { sale: CreatedSale; onBack: () => void }) {
  const { terms, details } = sale.payload;
  const token = findToken(terms.token);
  const now = useChainNow();
  const status = useSaleStatus(sale);
  const settled = status.kind !== "waiting";
  const isProtected = terms.mode === Mode.Protected;
  const amount = token ? `${formatTokenAmount(terms.amount, token.decimals)} ${token.symbol}` : "";

  return (
    <>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to new sale"
        className="-ml-2 flex min-h-11 w-fit items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden className="size-5">
          <path
            d="M12 15l-5-5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Back
      </button>

      <Card className="text-center">
        <p className="text-sm text-muted">{details.item}</p>
        <p className="text-4xl font-bold tracking-tight">{formatNaira(details.priceNgn)}</p>
        <p className="text-sm text-muted">{amount}</p>

        {!isProtected && !settled && (
          <>
            {/* Always dark-on-white: inverted QR codes confuse many scanners. */}
            <div className="mx-auto mt-4 w-full max-w-72 rounded-2xl bg-white p-3 ring-1 ring-border">
              <QRCodeSVG
                value={sale.url}
                size={512}
                level="L"
                fgColor="#000000"
                bgColor="#ffffff"
                className="h-auto w-full"
                title="Payment QR code"
              />
            </div>
            <p className="mt-3 text-sm font-medium">Customer scans with their phone camera or wallet</p>
          </>
        )}

        {now !== undefined && !settled && (
          <p className="mt-2 text-xs text-muted">
            {now > Number(terms.expiry) ? "This link has expired" : `Price locked · ${formatTimeLeft(terms.expiry, now)}`}
          </p>
        )}
        <div className="mt-4">
          <SaleStatusBanner sale={sale} status={status} />
        </div>
      </Card>

      {!settled &&
        (isProtected ? <ShareLink sale={sale} amount={amount} /> : <CopyLink url={sale.url} label="Copy payment link" />)}

      <Button variant="secondary" onClick={onBack}>
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
      <p className="mt-1 text-sm text-muted">
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
        <summary className="cursor-pointer text-muted">Show QR code</summary>
        <div className="mx-auto mt-3 w-full max-w-64 rounded-xl bg-white p-3">
          <QRCodeSVG
            value={sale.url}
            size={512}
            level="L"
            fgColor="#000000"
            bgColor="#ffffff"
            className="h-auto w-full"
            title="Payment link QR code"
          />
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
