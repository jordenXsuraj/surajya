import { useSyncExternalStore } from 'react';

import { useAuthStore } from '@/stores/auth.store';

// A clock that ticks once per second while something is subscribed.
const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};
const nowInSeconds = () => Math.floor(Date.now() / 1000);

/** Seconds until "Resend code" is available, updated every second. */
export function useResendCountdown(): number {
  const availableAt = useAuthStore((s) => s.resendAvailableAt);
  const now = useSyncExternalStore(subscribe, nowInSeconds);
  return Math.max(0, Math.floor(availableAt / 1000) - now);
}

export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
