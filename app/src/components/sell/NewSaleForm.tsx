"use client";

import { useState } from "react";
import { getAddress, isAddress, zeroAddress, type Address } from "viem";
import { Button } from "@/components/Button";
import { Field, inputClass } from "@/components/Field";
import { Card } from "@/components/Shell";
import { env } from "@/config/env";
import { supportedTokens, type Token } from "@/config/tokens";
import { useRate } from "@/hooks/useRate";
import { formatClock, formatDuration, formatNaira, formatTokenAmount } from "@/lib/format";
import {
  DELIVERY_PRESETS,
  quoteAmount,
  saleTotalNgn,
  validateSale,
  type DeliveryPreset,
  type SaleErrors,
  type SaleInput,
  type SaleLineInput,
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
  const [rows, setRows] = useState<SaleLineInput[]>([{ name: "", qty: "1", unitNgn: "" }]);
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
  const total = saleTotalNgn({ items: rows });

  const setRow = (index: number, patch: Partial<SaleLineInput>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const input: SaleInput | undefined = rate.data && {
    mode,
    seller,
    token,
    items: rows,
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
  const amount = input && total ? quoteAmount(total, input.rate, token) : null;
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
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1" role="radiogroup" aria-label="Payment type">
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
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
              mode === option.value
                ? "bg-surface text-fg shadow-card ring-1 ring-border"
                : "text-muted hover:text-fg"
            }`}
          >
            {option.label}
            <span className="block text-xs font-normal text-muted">{option.hint}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-fg">What are you selling?</legend>
          <div className="space-y-2">
            {rows.map((row, index) => (
              // Narrow phones: name on its own row, then qty and price side by
              // side. From 640px it's one row: qty · name · price.
              <div
                key={index}
                className="grid grid-cols-2 gap-2 sm:grid-cols-[3.5rem_1fr_7.5rem] sm:items-center"
              >
                <input
                  className={`${inputClass} col-span-2 w-full min-w-0 sm:order-2 sm:col-span-1`}
                  value={row.name}
                  onChange={(e) => setRow(index, { name: e.target.value })}
                  placeholder={index === 0 ? "e.g. Ankara dress" : "Another item"}
                  aria-label={`Item ${index + 1}`}
                  maxLength={60}
                />
                <input
                  className={`${inputClass} w-full px-1 text-center tabular-nums sm:order-1`}
                  value={row.qty}
                  onChange={(e) => setRow(index, { qty: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  aria-label={`Quantity for item ${index + 1}`}
                  placeholder="1"
                />
                <div className="relative sm:order-3">
                  <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted">₦</span>
                  <input
                    className={`${inputClass} w-full pl-6 pr-2 tabular-nums`}
                    value={row.unitNgn}
                    onChange={(e) => setRow(index, { unitNgn: e.target.value })}
                    inputMode="decimal"
                    aria-label={`Price for item ${index + 1}`}
                    placeholder="15000"
                  />
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove item ${index + 1}`}
                    className="col-span-2 -mt-1 flex min-h-8 items-center justify-end text-xs font-medium text-muted hover:text-danger sm:order-4 sm:col-span-3"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {show("items") && <p className="mt-1.5 text-xs font-medium text-danger">{errors.items}</p>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setRows((current) => [...current, { name: "", qty: "1", unitNgn: "" }])}
              disabled={rows.length >= 20}
              className="flex min-h-11 items-center gap-1 text-sm font-medium text-brand disabled:text-muted"
            >
              + Add item
            </button>
            {rows.length > 1 && (
              <p className="text-right text-sm text-muted">
                Total{" "}
                <span className="text-lg font-bold text-fg tabular-nums">
                  {total ? formatNaira(total) : "—"}
                </span>
              </p>
            )}
          </div>
        </fieldset>

        <Field label="Buyer pays in">
          <select className={`${inputClass} w-full`} value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value as Address)}>
            {tokens.map((t) => (
              <option key={t.address} value={t.address}>
                {t.symbol}
              </option>
            ))}
          </select>
        </Field>

        <QuoteLine amount={amount} token={token} rate={rate.data} loading={rate.isLoading} error={rate.isError || !!errors.rate} message={errors.rate} />

        {isProtected && (
          <>
            <Field label="Delivery" error={show("delivery")}>
              <div className="grid gap-2 sm:grid-cols-3">
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
                  <input className={`${inputClass} w-full`} inputMode="numeric" value={shipHours} onChange={(e) => setShipHours(e.target.value)} />
                </Field>
                <Field label="Hours to confirm">
                  <input className={`${inputClass} w-full`} inputMode="numeric" value={confirmHours} onChange={(e) => setConfirmHours(e.target.value)} />
                </Field>
              </div>
            )}
            {env.arbiterAddress ? (
              <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl py-1 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                  checked={useArbiter}
                  onChange={(e) => setUseArbiter(e.target.checked)}
                />
                <span>
                  Disputes go to TrueAlert Resolution
                  <span className="block text-xs text-muted">Buyers trust protected orders more when problems can be reviewed.</span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-muted">No referee is configured, so this order can&apos;t be disputed.</p>
            )}
          </>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted">More options</summary>
          <div className="mt-3 space-y-3">
            <Field label="Shop name (shown to buyers)" error={show("sellerName")}>
              <input className={`${inputClass} w-full`} value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="e.g. Chioma's Closet" maxLength={60} />
            </Field>
            <Field label="Note to buyer" error={show("note")}>
              <textarea className={`${inputClass} w-full`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Size 12, blue. Delivery to Yaba." maxLength={280} />
            </Field>
            <Field label="Only this wallet can pay (optional)" error={submitted || lockTo ? errors.lockToBuyer : undefined}>
              <input className={`${inputClass} w-full font-mono text-xs`} value={lockTo} onChange={(e) => setLockTo(e.target.value.trim())} placeholder="0x… (for repeat customers)" />
            </Field>
          </div>
        </details>

        <Button onClick={submit} busy={busy} disabled={!input || !!errors.rate}>
          {submitLabel(mode)}
        </Button>
        <p className="text-center text-xs text-muted">
          You&apos;ll sign in your wallet. It&apos;s free: no network fee to create a sale.
        </p>
      </div>
    </Card>
  );
}

function PresetButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl p-3 text-left text-xs transition-colors ${
        active ? "bg-brand-soft ring-2 ring-brand" : "bg-surface ring-1 ring-border-strong hover:bg-surface-muted"
      }`}
    >
      <span className="block text-sm font-semibold text-fg">{title}</span>
      <span className="text-muted">{children}</span>
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
  if (loading) return <p className="text-sm text-muted">Getting today&apos;s rate…</p>;
  if (error || !rate) {
    return <p className="text-sm text-danger">{message ?? "Exchange rate unavailable. Try again shortly."}</p>;
  }
  return (
    <p className="rounded-xl bg-surface-muted px-3.5 py-3 text-sm text-fg ring-1 ring-border">
      {amount !== null ? (
        <>
          Buyer pays{" "}
          <span className="font-semibold text-fg">
            {formatTokenAmount(amount, token.decimals)} {token.symbol}
          </span>
        </>
      ) : (
        "Enter a price to see what the buyer pays"
      )}
      <span className="block text-xs text-muted">
        Rate ₦{Number(rate.ngnPerUsd).toLocaleString("en-NG")}/$ ·{" "}
        {rate.source === "quidax" ? "Quidax" : "Official rate (daily)"} · {formatClock(rate.at)} · locked when you create the sale
      </span>
    </p>
  );
}
