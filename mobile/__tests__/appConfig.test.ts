import type { ExpoConfig } from 'expo/config';

import appJson from '../app.json';
import { buildConfig, resolveVariant } from '../app.config';
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
    expect(config.ios?.associatedDomains).toEqual(['applinks:themeetnet.com']);

    const filter = config.android?.intentFilters?.[0];
    expect(filter?.autoVerify).toBe(true);
    const data = Array.isArray(filter?.data) ? filter.data : [];
    expect(data.map((d) => d.pathPrefix)).toEqual(['/post', '/profile', '/reset-password']);
    expect(data.every((d) => d.scheme === 'https' && d.host === 'themeetnet.com')).toBe(true);
  });

  it('keeps what eas init wrote (owner, project id) and the shared settings', () => {
    const config = buildConfig(base, 'production');
    expect(config.owner).toBe('aniket078s-team');
    expect((config.extra as { eas?: { projectId?: string } }).eas?.projectId).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(config.userInterfaceStyle).toBe('dark');
    expect(config.plugins).toEqual(expect.arrayContaining(['expo-router', 'expo-secure-store']));
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

  it('only preview/production bake in the production API; nothing else is in env', () => {
    const env = (name: keyof typeof easJson.build) =>
      (easJson.build[name] as { env?: Record<string, string> }).env ?? {};
    expect(env('development')).toEqual({ APP_VARIANT: 'development' });
    expect(env('preview').EXPO_PUBLIC_API_URL).toBe('https://surajya.onrender.com/api');
    expect(env('production').EXPO_PUBLIC_API_URL).toBe('https://surajya.onrender.com/api');
  });
});
