import type { ReactNode } from "react";
import { env } from "@/config/env";

const networkLabel = { local: "Local chain", testnet: "Testnet", mainnet: null } as const;

/** Mobile-first page frame: brand header, content column, trust footer. */
export function Shell({ children }: { children: ReactNode }) {
  const label = networkLabel[env.chainKey];
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8">
      <header className="flex items-center justify-between py-4">
        <span className="text-lg font-bold tracking-tight">
          True<span className="text-brand">Alert</span>
        </span>
        {label && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
            {label}
          </span>
        )}
      </header>
      <main className="flex flex-1 flex-col gap-4">{children}</main>
      <footer className="pt-8 text-center text-xs text-neutral-500">
        Payments settle on the Electroneum blockchain. TrueAlert never holds your keys.
      </footer>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${className}`}>
      {children}
    </section>
  );
}

type Tone = "info" | "success" | "warning" | "danger";
const toneClasses: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-900 ring-sky-200",
  success: "bg-green-50 text-green-900 ring-green-200",
  warning: "bg-amber-50 text-amber-900 ring-amber-200",
  danger: "bg-red-50 text-red-900 ring-red-200",
};

export function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={`rounded-xl p-4 text-sm ring-1 ${toneClasses[tone]}`} role="status">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 opacity-90">{children}</div>}
    </div>
  );
}
