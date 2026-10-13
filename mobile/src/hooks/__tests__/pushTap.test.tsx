import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';

// Tapping a push (background or killed): the target becomes the pending path, which the tabs
// layout opens once it is mounted, so a cold start's first screen can't override it.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
  useRootNavigationState: jest.fn(() => ({ key: 'root' })),
}));

const tap = (id: string, data: Record<string, unknown>) => ({
  actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
  notification: { request: { identifier: id, content: { title: 'MeetNet', body: 'x', data } } },
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const lastResponse = Notifications.useLastNotificationResponse as jest.Mock;

beforeEach(() => {
  resetAll();
  mockApi(() => ({ status: 200, data: { ok: true } }));
});
afterEach(() => lastResponse.mockReturnValue(undefined));

it('signed in, cold start: the tapped post becomes the pending path (opened by the tabs layout)', async () => {
  useAuthStore.getState().signIn('jwt', sessionUser());
  lastResponse.mockReturnValue(tap('n1', { type: 'post_replied', postId: 'p1', url: '/post/p1' }));
  const { unmount } = await renderHook(() => usePushNotifications(), { wrapper });
  expect(useAuthStore.getState().pendingPath).toBe('/post/p1');
  expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  await unmount();
});

it('signed out: kept for after the sign-in', async () => {
  useAuthStore.setState({ status: 'signedOut' });
  lastResponse.mockReturnValue(tap('n2', { type: 'connection_request', senderId: 'u9', url: '/profile/u9' }));
  const { unmount } = await renderHook(() => usePushNotifications(), { wrapper });
  expect(useAuthStore.getState().pendingPath).toBe('/profile/u9');
  await unmount();
});

it('the same tap is handled once, other actions are ignored', async () => {
  useAuthStore.getState().signIn('jwt', sessionUser());
  lastResponse.mockReturnValue({ ...tap('n3', { url: '/post/p3' }), actionIdentifier: 'dismiss' });
  const { rerender, unmount } = await renderHook(() => usePushNotifications(), { wrapper });
  expect(useAuthStore.getState().pendingPath).toBeNull();

  lastResponse.mockReturnValue(tap('n4', { url: '/post/p4' }));
  await rerender({});
  expect(useAuthStore.getState().pendingPath).toBe('/post/p4');
  useAuthStore.getState().setPendingPath(null); // the tabs layout opened it
  await rerender({});
  expect(useAuthStore.getState().pendingPath).toBeNull(); // not opened a second time
  await unmount();
});
