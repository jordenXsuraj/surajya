import * as WebBrowser from 'expo-web-browser';
import { Linking } from 'react-native';

import { useUiStore } from '@/stores/ui.store';
import { colors } from '@/theme/tokens';

export const WEB_URL = 'https://themeetnet.com';

export const webPages = {
  terms: `${WEB_URL}/terms`,
  privacy: `${WEB_URL}/privacy`,
  communityGuidelines: `${WEB_URL}/community-guidelines`,
  forgotPassword: `${WEB_URL}/forgot-password`,
  /** The web's deletion page (works logged out); the app has its own screen, me/delete-account. */
  deleteAccount: `${WEB_URL}/delete-account`,
} as const;

/** Same address as the web (nexusnetwork/src/config/legal.js). */
export const SUPPORT_EMAIL = 'support@themeetnet.com';

/** Opens the mail app on a message to support; without one, a toast shows the address. */
export async function emailSupport(): Promise<void> {
  try {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  } catch {
    useUiStore.getState().showToast(`No email app found. Write to ${SUPPORT_EMAIL}`, 'info');
  }
}

/** Opens a web page in the in-app browser, styled like the app. */
export function openWebPage(url: string): Promise<unknown> {
  return WebBrowser.openBrowserAsync(url, {
    toolbarColor: colors.bg,
    controlsColor: colors.text,
    enableBarCollapsing: true,
  });
}
