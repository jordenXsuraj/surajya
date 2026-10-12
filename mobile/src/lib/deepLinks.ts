import { WEB_URL } from '@/lib/links';

// Links into the app: App Links / universal links (https://themeetnet.com/…, www too), the
// custom schemes (meetnet://, meetnet-dev:// for the development build) and push `data.url`.
// The routes mirror the web, so a link's path is the app route.

// (React Native's URL has no reliable host/pathname getters, so links are parsed by hand.)
const WEB_HOST = WEB_URL.replace(/^https?:\/\//, '');
const WEB_HOSTS = new Set([WEB_HOST, `www.${WEB_HOST}`]);
const APP_SCHEMES = new Set(['meetnet', 'meetnet-dev']);

/** Screens a link may open. Anything else falls through to +not-found. */
const LINKABLE = [
  /^\/post\/[A-Za-z0-9_-]+$/,
  /^\/profile\/[A-Za-z0-9_-]+(\/(followers|following))?$/,
  /^\/notifications$/,
];

const URL_PARTS = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)/i;

function cleanPath(path: string): string {
  const collapsed = `/${path}`.replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : '/';
}

/**
 * The in-app path for a link the system hands the app, or null when the link is not ours (other
 * hosts and schemes): those pass through unchanged.
 *   https://themeetnet.com/post/abc?utm=x → /post/abc
 *   meetnet://profile/abc/ → /profile/abc
 *   meetnet:// → /
 *   meetnet-dev://expo-development-client/?url=… (the dev client's launcher link) → /
 */
export function linkPath(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith('/')) return cleanPath(trimmed.split(/[?#]/)[0] ?? '/');

  const parts = URL_PARTS.exec(trimmed);
  if (!parts) return null;
  const scheme = parts[1]!.toLowerCase();
  const host = parts[2]!.toLowerCase();
  const path = parts[3] ?? '';

  if (host === 'expo-development-client') return '/';
  if (scheme === 'https' || scheme === 'http') {
    return WEB_HOSTS.has(host) ? cleanPath(path) : null;
  }
  if (APP_SCHEMES.has(scheme)) return cleanPath(`${host}${path}`);
  return null;
}

/** A path (or link) the app can open from a push or a link; null for anything else. */
export function allowedAppPath(urlOrPath: string): string | null {
  const path = linkPath(urlOrPath);
  if (!path) return null;
  return LINKABLE.some((re) => re.test(path)) ? path : null;
}

export type IncomingLink =
  /** Leave the URL as it is (other hosts and schemes). */
  | { kind: 'passthrough' }
  /** Open this path now. */
  | { kind: 'open'; path: string }
  /** Signed out: show sign-in and open `path` after signing in. */
  | { kind: 'afterSignIn'; path: string };

/**
 * What +native-intent does with a link. Signed out, a link to a screen is kept for after sign-in
 * (the signed-in screens are behind Stack.Protected, which would drop the path).
 */
export function resolveIncomingLink(url: string, signedIn: boolean): IncomingLink {
  const path = linkPath(url);
  if (path === null) return { kind: 'passthrough' };
  if (path === '/') return { kind: 'open', path: '/' };
  if (!signedIn) {
    const allowed = allowedAppPath(path);
    return allowed ? { kind: 'afterSignIn', path: allowed } : { kind: 'open', path: '/' };
  }
  return { kind: 'open', path };
}
