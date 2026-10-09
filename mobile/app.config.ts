import type { ConfigContext, ExpoConfig } from 'expo/config';

// app.json holds what `eas init` wrote (owner, extra.eas.projectId) plus the shared
// static settings; everything that differs per build variant is decided here.
//
// APP_VARIANT=development → "MeetNet Dev" (com.themeetnet.app.dev, scheme meetnet-dev,
//   no App Links), installable next to the real app.
// APP_VARIANT=preview | production (or unset) → "MeetNet" (com.themeetnet.app, scheme meetnet).

export type AppVariant = 'development' | 'preview' | 'production';

const VARIANTS: readonly AppVariant[] = ['development', 'preview', 'production'];

const BG = '#0d0d0d';
const DEV_ICON_BG = '#a73333'; // accent — tells the dev build apart on the launcher

const APP_LINK_PATHS = ['/post', '/profile', '/reset-password'];

export function resolveVariant(value: string | undefined): AppVariant {
  if (!value) return 'production';
  if ((VARIANTS as readonly string[]).includes(value)) return value as AppVariant;
  throw new Error(`Unknown APP_VARIANT "${value}" (expected ${VARIANTS.join(', ')})`);
}

export function buildConfig(config: ExpoConfig, variant: AppVariant): ExpoConfig {
  const isDev = variant === 'development';
  const id = isDev ? 'com.themeetnet.app.dev' : 'com.themeetnet.app';

  return {
    ...config,
    name: isDev ? 'MeetNet Dev' : 'MeetNet',
    slug: 'meetnet',
    scheme: isDev ? 'meetnet-dev' : 'meetnet',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: BG,
    icon: './assets/icon.png',
    ios: {
      ...config.ios,
      bundleIdentifier: id,
      supportsTablet: false,
      ...(isDev ? {} : { associatedDomains: ['applinks:themeetnet.com'] }),
    },
    android: {
      ...config.android,
      package: id,
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
                data: APP_LINK_PATHS.map((pathPrefix) => ({
                  scheme: 'https',
                  host: 'themeetnet.com',
                  pathPrefix,
                })),
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
        'expo-splash-screen',
        {
          backgroundColor: BG,
          image: './assets/splash-icon.png',
          imageWidth: 160,
          resizeMode: 'contain',
        },
      ],
    ],
  };
}

export default ({ config }: ConfigContext): ExpoConfig =>
  buildConfig(config as ExpoConfig, resolveVariant(process.env.APP_VARIANT));
