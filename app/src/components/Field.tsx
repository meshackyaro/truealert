import type { ReactNode } from "react";

/** Shared input styling: 16px text so iOS doesn't zoom, generous tap target. */
export const inputClass =
  "w-full rounded-xl border border-border-strong bg-surface px-3.5 py-3 text-base text-fg outline-none transition-colors placeholder:text-muted/70 focus:border-brand focus:ring-4 focus:ring-brand/15";

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-fg">{label}</span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-xs font-medium text-danger">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}
