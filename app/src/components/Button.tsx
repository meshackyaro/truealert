import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary: "bg-brand text-white hover:bg-brand-dark disabled:bg-neutral-300",
  secondary: "bg-white text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:text-neutral-400",
  danger: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50 disabled:text-neutral-400",
};

/** Full-width, thumb-sized button with a busy state. */
export function Button({ busy, variant = "primary", disabled, children, className = "", ...rest }: Props) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy}
      className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${className}`}
      {...rest}
    >
      {busy && (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
