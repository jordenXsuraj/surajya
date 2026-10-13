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

/**
 * Always from the server: the API sends `Cache-Control: max-age=60`, and Android's HTTP cache
 * (OkHttp) would otherwise answer "Check again" / "Try again" with the copy it already has, so a
 * lowered minimum version or the end of maintenance showed up only a minute later.
 */
export const getAppConfig = () =>
  request<AppConfig>({ method: 'GET', url: '/app/config', headers: { 'Cache-Control': 'no-cache' } });
