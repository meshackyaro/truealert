"use client";

import { useEffect, useState } from "react";

/**
 * Current unix time in seconds, ticking every `intervalMs`. Undefined until
 * mounted, so server and client render the same HTML (no hydration mismatch
 * from countdowns).
 */
export function useNow(intervalMs = 1_000): number | undefined {
  const [now, setNow] = useState<number>();
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
