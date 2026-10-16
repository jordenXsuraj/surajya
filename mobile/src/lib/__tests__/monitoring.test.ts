import * as Sentry from '@sentry/react-native';

import { scrubEvent, scrubText, scrubValue, TRACES_SAMPLE_RATE } from '@/lib/monitoring';
import { resetAll, sessionUser } from '@/test/helpers';

// Crash reports carry the user id only: no email, push tokens, auth headers or request bodies.
describe('scrubbing', () => {
  it('scrubText removes push tokens, bearer tokens, emails and query strings', () => {
    expect(scrubText('token ExponentPushToken[abc123] failed')).toBe('token [push token] failed');
    expect(scrubText('Authorization: Bearer eyJhbGciOi.payload.sig')).toBe(
      'Authorization: Bearer [token]',
    );
    expect(scrubText('no account for asha.p@college.edu')).toBe('no account for [email]');
    expect(scrubText('GET https://surajya.onrender.com/api/users?search=aditi&page=2 → 500')).toBe(
      'GET https://surajya.onrender.com/api/users → 500',
    );
  });

  it('scrubEvent drops the request body, auth / cookie headers and everything but the user id', () => {
    const event = scrubEvent({
      user: { id: 'u1', email: 'asha@example.com', username: 'asha', ip_address: '1.2.3.4' },
      request: {
        url: 'https://surajya.onrender.com/api/auth/login',
        data: { email: 'asha@example.com', password: 'secret' },
        headers: { Authorization: 'Bearer abc', Cookie: 'sid=1', 'Content-Type': 'json' },
      },
      breadcrumbs: [
        {
          category: 'xhr',
          data: { method: 'POST', url: 'https://x.test/api/users?search=riya', status_code: 400 },
        },
        { category: 'console', message: 'push ExponentPushToken[zzz] for riya@x.com' },
      ],
    } as Parameters<typeof scrubEvent>[0] & Record<string, unknown>);

    expect(event.user).toEqual({ id: 'u1' });
    expect(event.request).toEqual({
      url: 'https://surajya.onrender.com/api/auth/login',
      headers: { 'Content-Type': 'json' },
    });
    const crumbs = (event as unknown as { breadcrumbs: Record<string, unknown>[] }).breadcrumbs;
    expect(crumbs[0]).toEqual({
      category: 'xhr',
      data: { method: 'POST', url: 'https://x.test/api/users', status_code: 400 },
    });
    expect(crumbs[1]!.message).toBe('push [push token] for [email]');
  });

  it('keeps release names (app@version+build), which look like emails, and still scrubs emails', () => {
    // Seen in Sentry on 2026-10-17: the release had become "[email]+1"
    const event = scrubEvent({
      release: 'com.themeetnet.app@1.0.0+1',
      dist: '1',
      message: 'boot com.themeetnet.app@1.0.0+1 for asha.p@college.edu.in',
    } as Parameters<typeof scrubEvent>[0] & Record<string, unknown>);
    expect(event).toMatchObject({ release: 'com.themeetnet.app@1.0.0+1', dist: '1' });
    expect((event as unknown as { message: string }).message).toBe(
      'boot com.themeetnet.app@1.0.0+1 for [email]',
    );
    expect(scrubText('mail me: Riya.D+test@Gmail.COM')).toBe('mail me: [email]');
  });

  it('scrubValue drops credential keys at any depth', () => {
    expect(
      scrubValue({ a: { password: 'x', token: 'y', pushToken: 'z', keep: 'k', email: 'e@x.io' } }),
    ).toEqual({ a: { keep: 'k' } });
  });
});

describe('initMonitoring', () => {
  const load = (dsn: string | undefined) => {
    // process.env keeps strings only: assigning undefined would store "undefined"
    if (dsn) process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
    else delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    let mod!: typeof import('@/lib/monitoring');
    jest.isolateModules(() => {
      mod = jest.requireActual('@/lib/monitoring');
    });
    return mod;
  };

  beforeEach(() => {
    resetAll();
    jest.mocked(Sentry.init).mockClear();
    jest.mocked(Sentry.setUser).mockClear();
  });
  afterAll(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });

  it('does nothing without a DSN (development builds, tests)', () => {
    load(undefined).initMonitoring();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('with a DSN: no default PII, a low trace rate, no screenshots; signed out = no user', () => {
    const { initMonitoring } = load('https://key@o1.ingest.sentry.io/1');
    initMonitoring();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: 'https://key@o1.ingest.sentry.io/1',
        sendDefaultPii: false,
        tracesSampleRate: TRACES_SAMPLE_RATE,
        attachScreenshot: false,
      }),
    );
    expect(TRACES_SAMPLE_RATE).toBeLessThanOrEqual(0.1);
    expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
  });
});

describe('user id after login', () => {
  it('setUser gets the id, never the email', () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = 'https://key@o1.ingest.sentry.io/1';
    jest.isolateModules(() => {
      const { initMonitoring } = jest.requireActual('@/lib/monitoring');
      const { useAuthStore: store } = jest.requireActual('@/stores/auth.store');
      jest.mocked(Sentry.setUser).mockClear();
      initMonitoring();
      store.getState().signIn('jwt', sessionUser({ _id: 'u42', email: 'asha@example.com' }));
      expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: 'u42' });
      store.getState().logout();
      expect(Sentry.setUser).toHaveBeenLastCalledWith(null);
    });
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  });
});

describe('crash-reporting test buttons never ship', () => {
  // The app config each EAS profile builds, as the app sees it at runtime (Constants.expoConfig)
  const withVariant = (variant: 'development' | 'preview' | 'production') => {
    const { buildConfig } = jest.requireActual('../../../app.config');
    const appJson = jest.requireActual('../../../app.json');
    const expoConfig = buildConfig(appJson.expo, variant);
    let mod!: typeof import('@/lib/monitoring');
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig } }));
      mod = jest.requireActual('@/lib/monitoring');
    });
    return { mod, expoConfig };
  };

  beforeEach(() => {
    jest.mocked(Sentry.nativeCrash).mockClear();
    jest.mocked(Sentry.setTag).mockClear();
  });

  it('production (eas.json "production" profile): no section, and the triggers do nothing', () => {
    jest.useFakeTimers();
    try {
      const { mod, expoConfig } = withVariant('production');
      expect(expoConfig.extra?.appVariant).toBe('production');
      expect(mod.crashTestsAvailable()).toBe(false); // Settings renders the section only if true
      mod.testNativeCrash();
      mod.throwTestJsError();
      expect(() => jest.runAllTimers()).not.toThrow(); // no JS error was scheduled
      expect(Sentry.nativeCrash).not.toHaveBeenCalled();
      expect(Sentry.setTag).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each(['development', 'preview'] as const)('%s builds offer them', (variant) => {
    expect(withVariant(variant).mod.crashTestsAvailable()).toBe(true);
  });

  it('an unknown or missing variant counts as production', () => {
    let mod!: typeof import('@/lib/monitoring');
    jest.isolateModules(() => {
      jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: {} } }));
      mod = jest.requireActual('@/lib/monitoring');
    });
    expect(mod.crashTestsAvailable()).toBe(false);
  });

  it('the production EAS profile builds the production variant', () => {
    const eas = jest.requireActual('../../../eas.json');
    expect(eas.build.production.env.APP_VARIANT).toBe('production');
  });
});
