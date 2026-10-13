import { onlineManager, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect, useRootNavigationState } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { queryKeys } from '@/api/queryKeys';
import { pushPath, type PushData } from '@/lib/notifications';
import {
  cancelPushRetry,
  flushPendingUnregister,
  isNewDevicePushToken,
  logPushFailure,
  markPushPromptShown,
  pushPermission,
  pushPromptShownAt,
  registerForPush,
  shouldOfferPushPrompt,
  takePushPromptTurn,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';

/** What a push makes stale: always the notifications (list + count), plus what it is about. */
export function invalidateForPush(qc: QueryClient, data: PushData | null | undefined): void {
  void qc.invalidateQueries({ queryKey: queryKeys.notifications });
  switch (data?.type) {
    case 'connection_request':
      // new incoming request: the Activity list and the session's request ids (badge)
      void qc.invalidateQueries({ queryKey: queryKeys.requests, exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      break;
    case 'connection_accepted':
      // they accepted: I follow them now (buttons, Following feed)
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.followingFeed });
      if (data.senderId) void qc.invalidateQueries({ queryKey: queryKeys.userAll(data.senderId) });
      break;
    case 'post_liked':
    case 'post_replied':
    case 'interested':
      if (data.postId) void qc.invalidateQueries({ queryKey: queryKeys.post(data.postId) });
      break;
    default:
      break;
  }
}

const dataOf = (n: Notifications.Notification) =>
  (n.request.content.data ?? null) as PushData | null;

/**
 * Push notifications for the signed-in session (mounted once in the root layout):
 * - registers this device's token (sign-in, app back in front, token changes);
 * - a push while the app is open → in-app banner + fresh notifications / badges;
 * - tapping a push (app in the background or killed) → the post or profile from `data.url`.
 *   Signed out, the target waits until sign-in (pendingPath, like links).
 */
export function usePushNotifications(): void {
  const qc = useQueryClient();
  const status = useAuthStore((s) => s.status);
  const signedIn = status === 'signedIn';
  const navReady = Boolean(useRootNavigationState()?.key);
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef(new Set<string>());

  // An offline logout's pending removal: at start (once it's known who is signed in) and whenever
  // the connection comes back. Sign-in sends it as well (api/endpoints/auth).
  const authKnown = status !== 'loading';
  useEffect(() => {
    if (!authKnown) return;
    void flushPendingUnregister();
    return onlineManager.subscribe((online) => {
      if (online) void flushPendingUnregister();
    });
  }, [authKnown]);

  // Registration
  useEffect(() => {
    if (!signedIn) return;
    // A failure that can pass (offline, server error) is tried again by registerForPush itself
    const register = (force = false) => void registerForPush({ force }).catch(logPushFailure);
    register(true);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') register(); // permission may have been turned on in Settings
    });
    // Only a token that really changed: fetching the token fires this listener as well
    const tokens = Notifications.addPushTokenListener((token) => {
      if (isNewDevicePushToken(token.data)) register(true);
    });
    return () => {
      appState.remove();
      tokens.remove();
      cancelPushRetry();
    };
  }, [signedIn]);

  // Foreground pushes
  useEffect(() => {
    if (!signedIn) return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      // Signed out in the meantime (the listener goes with the next render): show nothing
      if (useAuthStore.getState().status !== 'signedIn') return;
      const data = dataOf(notification);
      invalidateForPush(qc, data);
      const { title, body } = notification.request.content;
      if (body) useUiStore.getState().showBanner({ title: title || 'MeetNet', body, href: pushPath(data) });
    });
    return () => sub.remove();
  }, [signedIn, qc]);

  // Taps on a push (background or killed state)
  useEffect(() => {
    if (!response || !navReady) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.current.has(id)) return;
    handled.current.add(id);
    // A JS reload would otherwise hand the same tap back once more
    Notifications.clearLastNotificationResponse();
    const data = dataOf(response.notification);
    const path = pushPath(data);
    if (__DEV__ && process.env.NODE_ENV !== 'test') console.log(`[push] opened from a notification: ${path}`);
    if (signedIn) invalidateForPush(qc, data);
    // Opened by the tabs layout once it is mounted (like links): a push right at a cold start
    // would otherwise be overridden by the navigator's own first screen; signed out, it waits
    // for the sign-in
    useAuthStore.getState().setPendingPath(path);
  }, [response, navReady, signedIn, qc]);
}

const PROMPT_DELAY_MS = 900;

/**
 * Home: opens the soft pre-prompt (push-prompt) shortly after Home comes into view, when the
 * system can still ask and it wasn't shown in the last 14 days. Not on top of a link or the
 * verify screen that sign-in is about to open.
 */
export function usePushPrompt(): void {
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const timer = setTimeout(() => {
        void pushPermission()
          .then((permission) => {
            const auth = useAuthStore.getState();
            if (cancelled || auth.status !== 'signedIn' || auth.pendingPath || auth.pendingVerify)
              return;
            if (!shouldOfferPushPrompt(permission, pushPromptShownAt())) return;
            if (!takePushPromptTurn()) return;
            markPushPromptShown();
            router.push('/push-prompt');
          })
          .catch(() => undefined);
      }, PROMPT_DELAY_MS);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, []),
  );
}
