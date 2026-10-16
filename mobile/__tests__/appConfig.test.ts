import type { ExpoConfig } from 'expo/config';

import appJson from '../app.json';
import {
  blockedPermissions,
  buildConfig,
  googleServicesFile,
  removeSentryStartupProviders,
  resolveVariant,
  SENTRY_STARTUP_PROVIDERS,
} from '../app.config';
import easJson from '../eas.json';

const base = appJson.expo as ExpoConfig;

describe('app identities', () => {
  it('development: separate "MeetNet Dev" identity without App Links', () => {
    const config = buildConfig(base, 'development');
    expect(config.name).toBe('MeetNet Dev');
    expect(config.scheme).toBe('meetnet-dev');
    expect(config.android?.package).toBe('com.themeetnet.app.dev');
    expect(config.ios?.bundleIdentifier).toBe('com.themeetnet.app.dev');
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.ios?.associatedDomains).toBeUndefined();
  });

  it.each(['preview', 'production'] as const)('%s: the real app with App Links', (variant) => {
    const config = buildConfig(base, variant);
    expect(config.name).toBe('MeetNet');
    expect(config.scheme).toBe('meetnet');
    expect(config.android?.package).toBe('com.themeetnet.app');
    expect(config.ios?.bundleIdentifier).toBe('com.themeetnet.app');
    expect(config.ios?.associatedDomains).toEqual([
      'applinks:themeetnet.com',
      'applinks:www.themeetnet.com',
    ]);

    const filter = config.android?.intentFilters?.[0];
    expect(filter?.autoVerify).toBe(true);
    const data = Array.isArray(filter?.data) ? filter.data : [];
    expect(data.map((d) => `${d.scheme}://${d.host}${d.pathPrefix}`)).toEqual([
      'https://themeetnet.com/post',
      'https://themeetnet.com/profile',
      'https://www.themeetnet.com/post',
      'https://www.themeetnet.com/profile',
    ]);
  });

  it('push: expo-notifications with the monochrome icon, accent colour and "default" channel', () => {
    const config = buildConfig(base, 'production');
    const plugin = config.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
    expect(plugin).toEqual([
      'expo-notifications',
      { icon: './assets/notification-icon.png', color: '#a73333', defaultChannel: 'default' },
    ]);
  });

  it('google-services.json: the EAS file variable, else the ignored local copy', () => {
    expect(googleServicesFile({ GOOGLE_SERVICES_JSON: '/eas/tmp/google-services.json' })).toBe(
      '/eas/tmp/google-services.json',
    );
    expect(googleServicesFile({})).toBe('./google-services.json');
  });

  it('keeps what eas init wrote (owner, project id) and the shared settings', () => {
    const config = buildConfig(base, 'production');
    expect(config.owner).toBe('aniket078s-team');
    expect((config.extra as { eas?: { projectId?: string } }).eas?.projectId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(config.userInterfaceStyle).toBe('dark');
    expect(config.plugins).toEqual(
      expect.arrayContaining(['expo-router', ['expo-secure-store', { faceIDPermission: false }]]),
    );
    expect((config.extra as { appVariant?: string }).appVariant).toBe('production');
  });

  it('privacy: unused permissions are removed (SYSTEM_ALERT_WINDOW kept for the dev overlay)', () => {
    const removedEverywhere = [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.USE_BIOMETRIC',
      'android.permission.USE_FINGERPRINT',
      'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
      'com.google.android.gms.permission.AD_ID',
    ];
    for (const variant of ['preview', 'production'] as const) {
      expect(buildConfig(base, variant).android?.blockedPermissions).toEqual([
        ...removedEverywhere,
        'android.permission.SYSTEM_ALERT_WINDOW',
      ]);
    }
    expect(blockedPermissions('development')).toEqual(removedEverywhere);
    // Still needed: camera (take photo), notifications, network state
    for (const kept of ['CAMERA', 'POST_NOTIFICATIONS', 'ACCESS_NETWORK_STATE']) {
      expect(blockedPermissions('production')).not.toContain(`android.permission.${kept}`);
    }
  });

  it("cold start: Sentry's start-up providers are removed from the merged manifest", () => {
    const manifest = {
      manifest: {
        $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
        application: [
          {
            $: { 'android:name': '.MainApplication' },
            provider: [{ $: { 'android:name': 'expo.modules.filesystem.FileSystemFileProvider' } }],
          },
        ],
      },
    } as unknown as Parameters<typeof removeSentryStartupProviders>[0];
    const out = removeSentryStartupProviders(manifest);
    expect(out.manifest.$['xmlns:tools']).toBe('http://schemas.android.com/tools');
    const providers = (
      out.manifest.application![0] as unknown as { provider: { $: Record<string, string> }[] }
    ).provider;
    expect(providers.map((p) => p.$['android:name'])).toEqual([
      'expo.modules.filesystem.FileSystemFileProvider', // other providers stay
      ...SENTRY_STARTUP_PROVIDERS,
    ]);
    for (const p of providers.slice(1)) {
      expect(p.$['tools:node']).toBe('remove');
      expect(p.$['android:authorities']).toMatch(
        /^\$\{applicationId\}\.Sentry(Init|Performance)Provider$/,
      );
    }
    // applying it twice doesn't add the entries twice
    expect(
      (
        removeSentryStartupProviders(out).manifest.application![0] as unknown as {
          provider: unknown[];
        }
      ).provider,
    ).toHaveLength(3);
    // every variant registers the manifest change
    for (const variant of ['development', 'preview', 'production'] as const) {
      const mods = (buildConfig(base, variant) as { mods?: { android?: { manifest?: unknown } } })
        .mods;
      expect(mods?.android?.manifest).toBeDefined();
    }
  });

  it('crash reports: the Sentry plugin, org / project from the build env, never a token', () => {
    const config = buildConfig(base, 'production');
    const plugin = config.plugins?.find(
      (p) => Array.isArray(p) && p[0] === '@sentry/react-native/expo',
    ) as [string, Record<string, unknown>] | undefined;
    expect(plugin?.[1]).toMatchObject({
      url: expect.stringMatching(/^https:\/\/(de\.)?sentry\.io\/$/),
    });
    expect(plugin?.[1]).not.toHaveProperty('authToken');
  });

  it('resolves APP_VARIANT (unset = production) and rejects typos', () => {
    expect(resolveVariant(undefined)).toBe('production');
    expect(resolveVariant('development')).toBe('development');
    expect(() => resolveVariant('dev')).toThrow(/Unknown APP_VARIANT/);
  });
});

describe('eas.json', () => {
  it('every build profile sets APP_VARIANT to its own name', () => {
    for (const [name, profile] of Object.entries(easJson.build)) {
      expect((profile as { env?: Record<string, string> }).env?.APP_VARIANT).toBe(name);
    }
  });

  it('only preview/production bake in the production API and the Sentry DSN; no secrets', () => {
    const env = (name: keyof typeof easJson.build) =>
      (easJson.build[name] as { env?: Record<string, string> }).env ?? {};
    expect(env('development')).toEqual({ APP_VARIANT: 'development' });
    expect(env('preview').EXPO_PUBLIC_API_URL).toBe('https://surajya.onrender.com/api');
    expect(env('production').EXPO_PUBLIC_API_URL).toBe('https://surajya.onrender.com/api');
    // Public values only: the auth token for source maps is an EAS secret, never in this file
    const allowed = [
      'APP_VARIANT',
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_SENTRY_DSN',
      'SENTRY_DISABLE_AUTO_UPLOAD',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_URL',
    ];
    for (const name of ['preview', 'production'] as const) {
      for (const key of Object.keys(env(name))) expect(allowed).toContain(key);
      expect(env(name).EXPO_PUBLIC_SENTRY_DSN ?? '').toMatch(/^(https:\/\/[\w]+@[\w.-]+\/\d+)?$/);
      // source maps are uploaded (no SENTRY_DISABLE_AUTO_UPLOAD) to the project in the EU region
      expect(env(name)).toMatchObject({
        SENTRY_ORG: 'meetnet',
        SENTRY_PROJECT: 'meetnet-mobile',
        SENTRY_URL: 'https://de.sentry.io/',
      });
      expect(env(name).SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
    }
  });
});
