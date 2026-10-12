import * as Application from 'expo-application';
import Constants from 'expo-constants';

/** "1.2.3" → [1, 2, 3]; null for anything that isn't three dot-separated numbers. */
function parts(version: string | null | undefined): [number, number, number] | null {
  const match = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(version ?? '');
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** -1 / 0 / 1 like a comparator; null when either side is not a valid version. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined) {
  const x = parts(a);
  const y = parts(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) {
    if (x[i]! !== y[i]!) return x[i]! < y[i]! ? -1 : 1;
  }
  return 0;
}

/**
 * True only when both versions are valid and `installed` is older than `minimum`: a broken
 * config or version never locks anyone out.
 */
export const isOlderVersion = (installed: string | null | undefined, minimum: string | null | undefined) =>
  compareVersions(installed, minimum) === -1;

/** The installed binary's version (app.config.ts `version`). */
export const installedVersion = (): string | null =>
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? null;
