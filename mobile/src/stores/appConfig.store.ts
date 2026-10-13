import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { getAppConfig, type AppConfig } from '@/api/endpoints/app';
import { installedVersion, isOlderVersion } from '@/lib/version';

// Remote switches from GET /api/app/config: loaded at start-up and again whenever the app comes
// back to the front (at most once a minute, the server's max-age). If the request fails the last
// known values stay, and before the first answer every feature is on: a broken config never
// locks anyone out.
type AppConfigState = {
  confessionsEnabled: boolean;
  pdfUploads: boolean;
  /** This binary is older than the server's minVersion for the platform: block with "Update". */
  updateRequired: boolean;
  /** Store page for the Update button ('' = none, e.g. iOS before the App Store listing). */
  storeUrl: string;
  maintenance: { enabled: boolean; message: string };
  loaded: boolean;
  apply: (config: AppConfig, installed?: string | null) => void;
};

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

export const useAppConfig = create<AppConfigState>()((set) => ({
  confessionsEnabled: true,
  pdfUploads: true,
  updateRequired: false,
  storeUrl: '',
  maintenance: { enabled: false, message: '' },
  loaded: false,
  apply: (config, installed = installedVersion()) =>
    set({
      confessionsEnabled: config.features?.confessionsEnabled?.[platform] !== false,
      pdfUploads: config.features?.pdfUploads !== false,
      updateRequired: isOlderVersion(installed, config.minVersion?.[platform]),
      storeUrl: (config.storeUrl?.[platform] ?? '').trim(),
      maintenance: {
        enabled: config.maintenance?.enabled === true,
        message: (config.maintenance?.message ?? '').trim(),
      },
      loaded: true,
    }),
}));

export const CONFIG_REFRESH_MS = 60_000;

let started = false;
let lastFetch = 0;
let inFlight: Promise<void> | null = null;

/** Fetches the config now (Try again on the maintenance screen), unless a fetch is running. */
export function refreshAppConfig(): Promise<void> {
  if (inFlight) return inFlight;
  lastFetch = Date.now();
  inFlight = getAppConfig()
    .then((config) => useAppConfig.getState().apply(config))
    .catch(() => undefined) // keep the last values (all on before the first answer)
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Start-up: load once, then again each time the app returns to the front. */
export function loadAppConfig(): void {
  if (started) return;
  started = true;
  void refreshAppConfig();
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastFetch >= CONFIG_REFRESH_MS) void refreshAppConfig();
  });
}
