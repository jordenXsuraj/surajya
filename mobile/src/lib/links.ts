import * as WebBrowser from 'expo-web-browser';

import { colors } from '@/theme/tokens';

export const WEB_URL = 'https://themeetnet.com';

export const webPages = {
  terms: `${WEB_URL}/terms`,
  privacy: `${WEB_URL}/privacy`,
  communityGuidelines: `${WEB_URL}/community-guidelines`,
  forgotPassword: `${WEB_URL}/forgot-password`,
  /** Until the app has its own screen (Prompt 7). */
  deleteAccount: `${WEB_URL}/delete-account`,
} as const;

/** Same address as the web (nexusnetwork/src/config/legal.js). */
export const SUPPORT_EMAIL = 'support@themeetnet.com';

/** Opens a web page in the in-app browser, styled like the app. */
export function openWebPage(url: string): Promise<unknown> {
  return WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.bg,
    controlsColor: colors.text,
    enableBarCollapsing: true,
  });
}
