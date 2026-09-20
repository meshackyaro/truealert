import Link from "next/link";
import type { ReactNode } from "react";
import { env } from "@/config/env";

const networkLabel = { local: "Local chain", testnet: "Testnet", mainnet: null } as const;

/**
 * Page frame: sticky header, a centred column that grows with the screen, and
 * a trust footer. Padding respects notched phones' safe areas.
 */
export function Shell({ children }: { children: ReactNode }) {
  const label = networkLabel[env.chainKey];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="safe-top sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:max-w-2xl">
          <Link href="/" className="text-lg font-bold tracking-tight">
            True<span className="text-brand">Alert</span>
          </Link>
          {label && <Badge tone="warning">{label}</Badge>}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8 lg:max-w-2xl">
        {children}
      </main>

      <footer className="safe-bottom mx-auto w-full max-w-lg px-4 pb-6 pt-8 text-center text-xs text-muted sm:px-6 lg:max-w-2xl">
        Payments settle on the Electroneum blockchain. TrueAlert never holds your keys.
      </footer>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl bg-surface shadow-card ring-1 ring-border ${className || "p-5 sm:p-6"}`}
    >
      {children}
    </section>
  );
}

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const badgeTones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-muted ring-border",
  info: "bg-surface-muted text-fg ring-border",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  brand: "bg-brand text-on-brand ring-transparent",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

const noticeTones: Record<Exclude<Tone, "neutral" | "brand">, string> = {
  info: "bg-surface text-fg ring-border",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
};

export function Notice({
  tone,
  title,
  children,
}: {
  tone: Exclude<Tone, "neutral" | "brand">;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-2xl p-4 text-sm ring-1 ${noticeTones[tone]}`} role="status">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-fg/80">{children}</div>}
    </div>
  );
}
