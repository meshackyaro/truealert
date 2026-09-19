"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { Button } from "./Button";

type Props = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  label: string;
  /** Shown after the first tap; a second tap within a few seconds confirms. */
  confirmLabel: string;
  onConfirm: () => void;
};

/** Two-tap button for irreversible actions (releasing or refunding money). */
export function ConfirmButton({ label, confirmLabel, onConfirm, busy, ...rest }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 5_000);
    return () => clearTimeout(id);
  }, [armed]);

  return (
    <Button
      {...rest}
      busy={busy}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed && !busy ? confirmLabel : label}
    </Button>
  );
}
