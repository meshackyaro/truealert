import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
  size?: "md" | "lg";
};

const variants = {
  primary:
    "bg-brand text-on-brand shadow-card hover:bg-brand-strong disabled:bg-border-strong disabled:text-muted disabled:shadow-none",
  secondary:
    "bg-surface text-fg ring-1 ring-border-strong hover:bg-surface-muted disabled:text-muted",
  danger: "bg-surface text-danger ring-1 ring-danger/30 hover:bg-danger-soft disabled:text-muted",
};

const sizes = {
  md: "min-h-11 px-4 py-2.5 text-sm",
  lg: "min-h-13 px-5 py-3 text-base",
};

/** Full-width, thumb-sized button with busy state and press feedback. */
export function Button({
  busy,
  variant = "primary",
  size = "lg",
  disabled,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      aria-busy={busy}
      className={`flex w-full items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.99] disabled:cursor-not-allowed disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
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
