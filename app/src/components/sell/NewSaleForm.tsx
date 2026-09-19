"use client";

import { useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { Button } from "@/components/Button";
import { Card } from "@/components/Shell";
import { env } from "@/config/env";
import { supportedTokens, type Token } from "@/config/tokens";
import { useRate } from "@/hooks/useRate";
import { formatClock, formatDuration, formatTokenAmount } from "@/lib/format";
import {
  DELIVERY_PRESETS,
  quoteAmount,
  validateSale,
  type DeliveryPreset,
  type SaleErrors,
  type SaleInput,
} from "@/lib/sale";
import { Mode } from "@/lib/terms";

type Props = {
  seller: Address;
  busy: boolean;
  submitLabel: (mode: Mode) => string;
  onSubmit: (input: SaleInput) => void;
};

const SELLER_NAME_KEY = "truealert:sellerName";

function readLocal(key: string): string {
  try {
    return typeof window === "undefined" ? "" : (localStorage.getItem(key) ?? "");
  } catch {
    return "";
  }
}

/** New sale: mode, item, naira price, currency, delivery and dispute options. */
export function NewSaleForm({ seller, busy, submitLabel, onSubmit }: Props) {
  const tokens = supportedTokens();
  const rate = useRate();

  const [mode, setMode] = useState<Mode>(Mode.PayNow);
  const [item, setItem] = useState("");
  const [priceNgn, setPriceNgn] = useState("");
  const [tokenAddress, setTokenAddress] = useState<Address>(tokens.find((t) => !t.native)?.address ?? zeroAddress);
  const [preset, setPreset] = useState<DeliveryPreset | "custom">("sameDay");
  const [shipHours, setShipHours] = useState("24");
  const [confirmHours, setConfirmHours] = useState("24");
  const [useArbiter, setUseArbiter] = useState(true);
  // Shop name is remembered on this device. The form only renders once a wallet
  // is connected (never on the server), so reading storage here is safe.
  const [sellerName, setSellerName] = useState(() => readLocal(SELLER_NAME_KEY));
  const [note, setNote] = useState("");
  const [lockTo, setLockTo] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const token = tokens.find((t) => t.address === tokenAddress) as Token;
  const isProtected = mode === Mode.Protected;
  const price = priceNgn.replace(/[,\s₦]/g, "");

  const input: SaleInput | undefined = rate.data && {
    mode,
    seller,
    token,
    priceNgn: price,
    item,
    sellerName,
    note,
    rate: rate.data,
    delivery:
      preset === "custom"
        ? { shipHours: Number(shipHours), confirmHours: Number(confirmHours) }
        : { preset },
    arbiter: isProtected && useArbiter && env.arbiterAddress ? env.arbiterAddress : undefined,
    lockToBuyer: lockTo && isAddress(lockTo) ? getAddress(lockTo) : undefined,
  };
  const errors: SaleErrors = input ? validateSale(input) : {};
  if (lockTo && !isAddress(lockTo)) errors.lockToBuyer = "That isn't a wallet address";
  const amount = input && !errors.priceNgn ? quoteAmount(price, input.rate, token) : null;
  const valid = !!input && Object.keys(errors).length === 0;
  const show = (field: keyof SaleErrors) => (submitted || field === "rate" || field === "delivery" ? errors[field] : undefined);

  const submit = () => {
    setSubmitted(true);
    if (!valid || !input) return;
    try {
      localStorage.setItem(SELLER_NAME_KEY, sellerName.trim());
    } catch {}
    onSubmit(input);
  };

  return (
    <Card>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1" role="radiogroup" aria-label="Payment type">
        {[
          { value: Mode.PayNow, label: "Pay now", hint: "In person" },
          { value: Mode.Protected, label: "🛡 Protected", hint: "In the DMs" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => setMode(option.value)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === option.value ? "bg-white shadow-sm" : "text-neutral-500"
            }`}
          >
            {option.label}
            <span className="block text-xs font-normal text-neutral-500">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <Field label="What are you selling?" error={show("item")}>
          <input
            className={inputClass}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="e.g. Ankara dress"
            maxLength={80}
          />
        </Field>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Field label="Price (₦)" error={show("priceNgn")}>
            <input
              className={`${inputClass} text-lg font-semibold`}
              value={priceNgn}
              onChange={(e) => setPriceNgn(e.target.value)}
              inputMode="decimal"
              placeholder="15000"
            />
          </Field>
          <Field label="Paid in">
            <select className={inputClass} value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value as Address)}>
              {tokens.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <QuoteLine amount={amount} token={token} rate={rate.data} loading={rate.isLoading} error={rate.isError || !!errors.rate} message={errors.rate} />

        {isProtected && (
          <>
            <Field label="Delivery" error={show("delivery")}>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(DELIVERY_PRESETS) as DeliveryPreset[]).map((key) => (
                  <PresetButton key={key} active={preset === key} onClick={() => setPreset(key)} title={DELIVERY_PRESETS[key].label}>
                    {formatDuration(DELIVERY_PRESETS[key].shipWindow)} to ship ·{" "}
                    {formatDuration(DELIVERY_PRESETS[key].confirmWindow)} to confirm
                  </PresetButton>
                ))}
                <PresetButton active={preset === "custom"} onClick={() => setPreset("custom")} title="Custom">
                  Your own times
                </PresetButton>
              </div>
            </Field>
            {preset === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Hours to ship">
                  <input className={inputClass} inputMode="numeric" value={shipHours} onChange={(e) => setShipHours(e.target.value)} />
                </Field>
                <Field label="Hours to confirm">
                  <input className={inputClass} inputMode="numeric" value={confirmHours} onChange={(e) => setConfirmHours(e.target.value)} />
                </Field>
              </div>
            )}
            {env.arbiterAddress ? (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={useArbiter} onChange={(e) => setUseArbiter(e.target.checked)} />
                <span>
                  Disputes go to TrueAlert Resolution
                  <span className="block text-xs text-neutral-500">Buyers trust protected orders more when problems can be reviewed.</span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-neutral-500">No referee is configured, so this order can&apos;t be disputed.</p>
            )}
          </>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">More options</summary>
          <div className="mt-3 space-y-3">
            <Field label="Shop name (shown to buyers)" error={show("sellerName")}>
              <input className={inputClass} value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="e.g. Chioma's Closet" maxLength={60} />
            </Field>
            <Field label="Note to buyer" error={show("note")}>
              <textarea className={inputClass} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Size 12, blue. Delivery to Yaba." maxLength={280} />
            </Field>
            <Field label="Only this wallet can pay (optional)" error={submitted || lockTo ? errors.lockToBuyer : undefined}>
              <input className={`${inputClass} font-mono text-xs`} value={lockTo} onChange={(e) => setLockTo(e.target.value.trim())} placeholder="0x… (for repeat customers)" />
            </Field>
          </div>
        </details>

        <Button onClick={submit} busy={busy} disabled={!input || !!errors.rate}>
          {submitLabel(mode)}
        </Button>
        <p className="text-center text-xs text-neutral-500">
          You&apos;ll sign in your wallet. It&apos;s free: no network fee to create a sale.
        </p>
      </div>
    </Card>
  );
}

const inputClass =
  "w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-green-100";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-700">{error}</span>}
    </label>
  );
}

function PresetButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-2 text-left text-xs ring-1 ${active ? "bg-green-50 ring-brand" : "bg-white ring-neutral-300"}`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="text-neutral-500">{children}</span>
    </button>
  );
}

function QuoteLine({
  amount,
  token,
  rate,
  loading,
  error,
  message,
}: {
  amount: bigint | null;
  token: Token;
  rate?: { ngnPerUsd: string; source: string; at: string };
  loading: boolean;
  error: boolean;
  message?: string;
}) {
  if (loading) return <p className="text-sm text-neutral-500">Getting today&apos;s rate…</p>;
  if (error || !rate) {
    return <p className="text-sm text-red-700">{message ?? "Exchange rate unavailable. Try again shortly."}</p>;
  }
  return (
    <p className="rounded-xl bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
      {amount !== null ? (
        <>
          Buyer pays{" "}
          <span className="font-semibold text-neutral-900">
            {formatTokenAmount(amount, token.decimals)} {token.symbol}
          </span>
        </>
      ) : (
        "Enter a price to see what the buyer pays"
      )}
      <span className="block text-xs text-neutral-500">
        Rate ₦{Number(rate.ngnPerUsd).toLocaleString("en-NG")}/$ ·{" "}
        {rate.source === "quidax" ? "Quidax" : "Official rate (daily)"} · {formatClock(rate.at)} · locked when you create the sale
      </span>
    </p>
  );
}
