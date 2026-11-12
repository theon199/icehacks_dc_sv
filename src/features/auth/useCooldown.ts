import { useCallback, useEffect, useState } from 'react';

/** Seconds people wait between emails; matches the auth server's own per-address limit. */
export const RESEND_COOLDOWN_SECONDS = 60;

/** A countdown for "send again" buttons. */
export function useCooldown(initialSeconds = 0): {
  remaining: number;
  start: (seconds?: number) => void;
} {
  const [endsAt, setEndsAt] = useState(() =>
    initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : 0,
  );
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt <= Date.now()) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds = RESEND_COOLDOWN_SECONDS) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  }, []);

  return { remaining: Math.max(0, Math.ceil((endsAt - now) / 1000)), start };
}
