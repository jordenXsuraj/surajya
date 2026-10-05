import { Platform } from 'react-native';
import { create } from 'zustand';

import { getAppConfig, type AppConfig } from '@/api/endpoints/app';

// Remote switches from GET /api/app/config, loaded once at start-up. If the request fails the
// defaults keep every feature on.
type AppConfigState = {
  confessionsEnabled: boolean;
  pdfUploads: boolean;
  loaded: boolean;
  apply: (config: AppConfig) => void;
};

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

export const useAppConfig = create<AppConfigState>()((set) => ({
  confessionsEnabled: true,
  pdfUploads: true,
  loaded: false,
  apply: (config) =>
    set({
      confessionsEnabled: config.features?.confessionsEnabled?.[platform] !== false,
      pdfUploads: config.features?.pdfUploads !== false,
      loaded: true,
    }),
}));

let started = false;

export function loadAppConfig(): void {
  if (started) return;
  started = true;
  getAppConfig()
    .then((config) => useAppConfig.getState().apply(config))
    .catch(() => undefined); // defaults stay (all on)
}
