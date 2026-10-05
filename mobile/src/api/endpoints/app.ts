import { request } from '@/api/client';

type PerPlatform<T> = { ios: T; android: T };

/** GET /api/app/config (public). Every field is always present. */
export type AppConfig = {
  minVersion: PerPlatform<string>;
  latestVersion: PerPlatform<string>;
  storeUrl: PerPlatform<string>;
  features: { confessionsEnabled: PerPlatform<boolean>; pdfUploads: boolean };
  maintenance: { enabled: boolean; message: string };
};

export const getAppConfig = () => request<AppConfig>({ method: 'GET', url: '/app/config' });
