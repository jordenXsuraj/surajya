import Constants from 'expo-constants';

/**
 * Runs `fn` once the JS thread is idle after the first screens rendered (at the latest after
 * `timeout` ms), so start-up work that can wait (remote config, push registration) doesn't compete
 * with the first frames and the first feed request. Returns a cancel function.
 */
export function whenIdle(fn: () => void, timeout = 1500): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(id);
  }
  const timer = setTimeout(fn, 0); // engines without idle callbacks (Jest)
  return () => clearTimeout(timer);
}

let homeMarked = false;

/**
 * Development and preview builds only (never production): one log line when Home's feed has drawn
 * its first posts, for cold-start measurements. Android: `adb logcat -s ReactNativeJS`; the time
 * since the process started is this line's timestamp minus the system's process-start line
 * (`am_proc_start`), which is how STORE_READINESS.md measures it.
 */
export function markHomeFeedRendered(): void {
  if (homeMarked) return;
  homeMarked = true;
  if (process.env.NODE_ENV === 'test') return;
  if ((Constants.expoConfig?.extra?.appVariant ?? 'production') === 'production') return;
  const now = performance.now();
  // React Native's own app-start time, when the native side reports one (else the JS clock only)
  let appStart: number | null | undefined;
  try {
    appStart = (performance as { rnStartupTiming?: { startTime?: number | null } }).rnStartupTiming
      ?.startTime;
  } catch {
    appStart = null;
  }
  const since = appStart != null ? ` ${Math.round(now - appStart)} ms after app start,` : '';
  console.log(`[startup] home feed first rendered:${since} JS clock ${Math.round(now)} ms`);
}
