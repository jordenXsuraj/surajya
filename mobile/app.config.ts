import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest, type AndroidConfig, type ConfigPlugin } from 'expo/config-plugins';

// app.json holds what `eas init` wrote (owner, extra.eas.projectId) plus the shared
// static settings; everything that differs per build variant is decided here.
//
// APP_VARIANT=development → "MeetNet Dev" (com.themeetnet.app.dev, scheme meetnet-dev,
//   no App Links), installable next to the real app.
// APP_VARIANT=preview | production (or unset) → "MeetNet" (com.themeetnet.app, scheme meetnet).

export type AppVariant = 'development' | 'preview' | 'production';

const VARIANTS: readonly AppVariant[] = ['development', 'preview', 'production'];

const BG = '#0d0d0d';
const ACCENT = '#a73333';
const DEV_ICON_BG = ACCENT; // tells the dev build apart on the launcher

// App Links / universal links: the web pages the app has screens for. www serves the same
// .well-known files (nexusnetwork/vercel.json), so it verifies too. /reset-password stays in the
// browser until the app has that screen.
export const APP_LINK_HOSTS = ['themeetnet.com', 'www.themeetnet.com'];
export const APP_LINK_PATHS = ['/post', '/profile'];

/**
 * Firebase config for FCM (Android push). It is not in git (public repo): EAS builds get it from
 * the GOOGLE_SERVICES_JSON file variable, local prebuilds from an ignored ./google-services.json.
 */
export const googleServicesFile = (env: Record<string, string | undefined> = process.env): string =>
  env.GOOGLE_SERVICES_JSON || './google-services.json';

/**
 * Permissions that libraries or the Expo template add but the app never uses (store privacy
 * labels list only what is needed). Checked on the merged manifest of a built APK; see
 * STORE_READINESS.md, "Permissions".
 * - storage (API <= 32): photos and PDFs come from the system pickers, which need none
 * - biometrics: expo-secure-store is never used with requireAuthentication
 * - install referrer: expo-application's referrer API is not used
 * - advertising id: no ads or analytics (a safeguard: no library adds it today)
 * - SYSTEM_ALERT_WINDOW: only the development build's overlay uses it
 */
export function blockedPermissions(variant: AppVariant): string[] {
  return [
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.USE_BIOMETRIC',
    'android.permission.USE_FINGERPRINT',
    'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE',
    'com.google.android.gms.permission.AD_ID',
    ...(variant === 'development' ? [] : ['android.permission.SYSTEM_ALERT_WINDOW']),
  ];
}

/**
 * Sentry's Android content providers run at process start, before the app's own code: they cost
 * ~330 ms of the first frame on the OPPO (STORE_READINESS.md, "Cold start"). The app doesn't need
 * them: `Sentry.init` (src/lib/monitoring.ts) starts the native SDK itself (auto-init is off), and
 * only Sentry's automatic "app start" span is lost. Removed from the merged manifest.
 */
export const SENTRY_STARTUP_PROVIDERS = [
  'io.sentry.android.core.SentryInitProvider',
  'io.sentry.android.core.SentryPerformanceProvider',
];

type Manifest = AndroidConfig.Manifest.AndroidManifest;
// <provider> entries (the config-plugins types don't model them)
type Provider = { $: Record<string, string> };

export function removeSentryStartupProviders(manifest: Manifest): Manifest {
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  const application = manifest.manifest.application?.[0] as
    (AndroidConfig.Manifest.ManifestApplication & { provider?: Provider[] }) | undefined;
  if (!application) return manifest;
  const providers = (application.provider ?? []).filter(
    (p) => !SENTRY_STARTUP_PROVIDERS.includes(p.$['android:name'] ?? ''),
  );
  for (const name of SENTRY_STARTUP_PROVIDERS) {
    providers.push({
      $: {
        'android:name': name,
        'android:authorities': `\${applicationId}.${name.split('.').pop()}`,
        'tools:node': 'remove',
      },
    });
  }
  application.provider = providers;
  return manifest;
}

const withoutSentryStartupProviders: ConfigPlugin = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults = removeSentryStartupProviders(c.modResults);
    return c;
  });

export function resolveVariant(value: string | undefined): AppVariant {
  if (!value) return 'production';
  if ((VARIANTS as readonly string[]).includes(value)) return value as AppVariant;
  throw new Error(`Unknown APP_VARIANT "${value}" (expected ${VARIANTS.join(', ')})`);
}

export function buildConfig(config: ExpoConfig, variant: AppVariant): ExpoConfig {
  const isDev = variant === 'development';
  const id = isDev ? 'com.themeetnet.app.dev' : 'com.themeetnet.app';

  // the Sentry start-up providers come out of the merged Android manifest (see above)
  return withoutSentryStartupProviders({
    ...config,
    name: isDev ? 'MeetNet Dev' : 'MeetNet',
    slug: 'meetnet',
    scheme: isDev ? 'meetnet-dev' : 'meetnet',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: BG,
    icon: './assets/icon.png',
    // The build variant at runtime (crash reports' environment, src/lib/monitoring.ts)
    extra: { ...config.extra, appVariant: variant },
    ios: {
      ...config.ios,
      bundleIdentifier: id,
      supportsTablet: false,
      ...(isDev ? {} : { associatedDomains: APP_LINK_HOSTS.map((host) => `applinks:${host}`) }),
    },
    android: {
      ...config.android,
      package: id,
      googleServicesFile: googleServicesFile(),
      blockedPermissions: blockedPermissions(variant),
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: isDev ? DEV_ICON_BG : BG,
      },
      predictiveBackGestureEnabled: false,
      ...(isDev
        ? {}
        : {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                data: APP_LINK_HOSTS.flatMap((host) =>
                  APP_LINK_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
                ),
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }),
    },
    plugins: [
      ...(config.plugins ?? []),
      [
        'expo-image-picker',
        {
          photosPermission:
            'MeetNet uses your photos only when you choose one for a post or your profile.',
          cameraPermission:
            'MeetNet uses the camera only when you take a photo for a post or your profile.',
          microphonePermission: false,
        },
      ],
      [
        'expo-notifications',
        {
          // white-on-transparent logo silhouette (Android status bar), tinted with the accent
          icon: './assets/notification-icon.png',
          color: ACCENT,
          defaultChannel: 'default',
        },
      ],
      [
        // Crash reports (src/lib/monitoring.ts). Release builds upload source maps with the EAS
        // secret SENTRY_AUTH_TOKEN; org, project and the region's URL come from the build env in
        // eas.json (not secrets; the organisation is in Sentry's EU region: de.sentry.io).
        '@sentry/react-native/expo',
        {
          url: process.env.SENTRY_URL || 'https://sentry.io/',
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: BG,
          image: './assets/splash-icon.png',
          imageWidth: 160,
          resizeMode: 'contain',
        },
      ],
    ],
  });
}

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config as ExpoConfig, resolveVariant(process.env.APP_VARIANT));
