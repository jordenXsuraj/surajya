import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { useAuthStore } from '@/stores/auth.store';

// Crash reporting with Sentry. Off unless the build has EXPO_PUBLIC_SENTRY_DSN (eas.json, preview
// and production; a DSN only lets apps send events, it is not a secret). What leaves the phone:
// errors and crashes with their stack, device model, OS and app version, and the signed-in
// user's id — never their email, name, request or response bodies, auth headers or push tokens.
// Release = "<app id>@<version>+<build number>" and dist = build number: the SDK's defaults,
// which are also what the EAS build uploads source maps for, so they are not set here.

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Share of sessions that send performance traces (app start, screen loads): kept low. */
export const TRACES_SAMPLE_RATE = 0.05;

const SECRETS: [RegExp, string][] = [
  [/Expo(nent)?PushToken\[[^\]]*\]/g, '[push token]'],
  [/Bearer\s+[\w.~+/=-]+/gi, 'Bearer [token]'],
  // the domain must end in letters: release names like com.themeetnet.app@1.0.0+1 are not emails
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi, '[email]'],
  // query strings can carry what someone typed (people search); the path is enough
  [/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/g, '$1'],
];

/** Removes push tokens, bearer tokens, email addresses and URL query strings from a string. */
export function scrubText(text: string): string {
  return SECRETS.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text);
}

const DROPPED_KEYS = new Set([
  'authorization',
  'cookie',
  'cookies',
  'body',
  'request_body',
  'response_body',
  'password',
  'token',
  'pushToken',
  'email',
]);

/** Deep copy with every string scrubbed and body / header / credential keys dropped. */
export function scrubValue<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (depth > 8 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubValue(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (DROPPED_KEYS.has(key) || DROPPED_KEYS.has(key.toLowerCase())) continue;
    out[key] = scrubValue(v, depth + 1);
  }
  return out as T;
}

type ScrubbableEvent = {
  user?: { id?: string | number } | null;
  request?: { data?: unknown };
};

/** No request body, no auth or cookie header, and of the user the id only. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  const id = event.user?.id;
  const { data: _body, ...request } = event.request ?? {};
  const clean = scrubValue({
    ...event,
    user: undefined,
    request: event.request ? request : undefined,
  });
  // release and dist must stay exactly as the SDK set them (they tie events to the source maps)
  const kept = event as { release?: unknown; dist?: unknown };
  const out = { ...clean, release: kept.release, dist: kept.dist } as E;
  if (kept.release === undefined) delete (out as { release?: unknown }).release;
  if (kept.dist === undefined) delete (out as { dist?: unknown }).dist;
  return id === undefined ? out : { ...out, user: { id: String(id) } };
}

let started = false;

/** Called once at start-up (root layout). Without a DSN (development, tests) nothing happens. */
export function initMonitoring(): void {
  if (started || !DSN) return;
  started = true;
  Sentry.init({
    dsn: DSN,
    environment: String(Constants.expoConfig?.extra?.appVariant ?? 'production'),
    sendDefaultPii: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 50,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubValue(breadcrumb),
  });
  // The user id after login (also a cached session at start-up); cleared on logout
  const applyUser = (id: string | undefined) => Sentry.setUser(id ? { id } : null);
  applyUser(useAuthStore.getState().user?._id);
  useAuthStore.subscribe((state, previous) => {
    if (state.user?._id !== previous.user?._id) applyUser(state.user?._id);
  });
}

/** A caught error worth knowing about (error boundaries). Logged in development. */
export function reportError(error: unknown, context?: { componentStack?: string }): void {
  if (__DEV__) console.error('[crash]', error, context?.componentStack ?? '');
  if (!started) return;
  Sentry.captureException(error, {
    contexts: context?.componentStack
      ? { react: { componentStack: scrubText(context.componentStack) } }
      : undefined,
  });
}

// ── Crash-reporting tests (development and preview builds only, Settings → "Crash reporting test")

/** True in development and preview builds; production never offers the tests. */
export function crashTestsAvailable(): boolean {
  return (Constants.expoConfig?.extra?.appVariant ?? 'production') !== 'production';
}

/**
 * An unhandled JS error, like a real one: React Native's error handler reports it to Sentry and the
 * app closes. Tagged `check: crash-test` so it is easy to find (and to ignore) in Sentry.
 */
export function throwTestJsError(): void {
  if (!crashTestsAvailable()) return;
  Sentry.setTag('check', 'crash-test');
  setTimeout(() => {
    throw new Error('MeetNet crash-reporting test: unhandled JS error');
  }, 0);
}

/** A native crash (Sentry's own test crash); the report is sent when the app starts again. */
export function testNativeCrash(): void {
  if (!crashTestsAvailable()) return;
  Sentry.setTag('check', 'crash-test');
  Sentry.nativeCrash();
}
