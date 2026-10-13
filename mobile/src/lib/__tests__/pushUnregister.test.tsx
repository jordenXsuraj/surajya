import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import { login } from '@/api/endpoints/auth';
import { signOut } from '@/hooks/useAccount';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import {
  flushPendingUnregister,
  forgetPushRegistration,
  PUSH_PENDING_UNREGISTER_KEY,
  PUSH_REGISTERED_KEY,
  pushDeviceId,
  registerForPush,
  REVOKE_MAX_REFUSALS,
  REVOKE_REFUSED_RETRY_MS,
  REVOKE_TIMEOUT_MS,
} from '@/lib/push';
import { TOKEN_KEY, useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { authUser, mockApi, resetAll, secureStoreMap, sessionUser, type Reply } from '@/test/helpers';

// A logout whose DELETE /users/me/push-token can't reach the server (offline here) leaves a pending
// removal, which is sent once possible: on the next start, when the connection comes back and
// before the next sign-in. It holds no session, only what identifies this device's entry.

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
  useRootNavigationState: jest.fn(() => ({ key: 'root' })),
}));

const TOKEN = 'ExponentPushToken[test-token]';
type Call = { method?: string; url?: string; data?: unknown; headers: Record<string, unknown> };
const isRevoke = (c: Call) => c.method === 'post' && c.url === '/users/push-token/revoke';
const isRegister = (c: Call) => c.method === 'post' && c.url === '/users/me/push-token';

let online = true; // whether requests reach the API
let revokeReachable = true; // a flaky moment: only the revoke fails
let revokeReply: Reply | 'hang' | null = null; // what the revoke gets instead of 200
let calls: Call[];

beforeEach(() => {
  resetAll();
  forgetPushRegistration();
  online = true;
  revokeReachable = true;
  revokeReply = null;
  calls = mockApi((c) => {
    if (!online || (!revokeReachable && isRevoke(c))) return 'network';
    if (revokeReply && isRevoke(c)) return revokeReply === 'hang' ? new Promise<Reply>(() => {}) : revokeReply;
    if (c.url === '/auth/login') return { status: 200, data: { token: 'jwt-b', user: { ...authUser, _id: 'b' } } };
    return { status: 200, data: { ok: true } };
  }) as Call[];
});

const pending = () => {
  const raw = secureStoreMap().get(PUSH_PENDING_UNREGISTER_KEY);
  return raw ? (JSON.parse(raw) as Record<string, string>) : null;
};

async function signInAndRegister(id: string) {
  useAuthStore.getState().signIn(`jwt-${id}`, sessionUser({ _id: id }));
  await expect(registerForPush({ force: true })).resolves.toBe(true);
}

async function offlineLogout() {
  online = false;
  await signOut();
  online = true;
}

/** App killed and opened again: module memory gone, SecureStore kept. */
async function restartApp() {
  forgetPushRegistration();
  useAuthStore.getState().hydrate();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(() => usePushNotifications(), { wrapper });
}

it('offline logout keeps a pending removal: this device\'s entry only, no session', async () => {
  await signInAndRegister('a');
  await offlineLogout();
  expect(useAuthStore.getState().status).toBe('signedOut');
  expect(pending()).toEqual({ userId: 'a', deviceId: pushDeviceId(), token: TOKEN });
  expect(secureStoreMap().has(TOKEN_KEY)).toBe(false); // the login token is gone, as always
  expect(secureStoreMap().has(PUSH_REGISTERED_KEY)).toBe(false);
  expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled(); // shade cleared too
});

it('a logout that reaches the server leaves nothing pending', async () => {
  await signInAndRegister('a');
  await signOut();
  expect(pending()).toBeNull();
});

it('offline logout → app restart online → the token is removed, the record cleared', async () => {
  await signInAndRegister('a');
  await offlineLogout();

  const { unmount } = await restartApp();
  await waitFor(() => expect(calls.filter(isRevoke)).toHaveLength(1));
  const revoke = calls.find(isRevoke)!;
  expect(JSON.parse(String(revoke.data))).toEqual({ userId: 'a', deviceId: pushDeviceId(), token: TOKEN });
  expect(revoke.headers.Authorization ?? null).toBeNull(); // sent without any session
  await waitFor(() => expect(pending()).toBeNull());
  await unmount();
});

it('offline logout → sign in as another user → the old user\'s token is removed first', async () => {
  await signInAndRegister('a');
  await offlineLogout();

  const data = await login('b@example.com', 'secret123');
  const order = calls.map((c) => c.url);
  expect(order.indexOf('/users/push-token/revoke')).toBeGreaterThan(-1);
  expect(order.indexOf('/users/push-token/revoke')).toBeLessThan(order.indexOf('/auth/login'));
  expect(JSON.parse(String(calls.find(isRevoke)!.data))).toMatchObject({ userId: 'a', token: TOKEN });
  expect(pending()).toBeNull();

  useAuthStore.getState().signIn(data.token, sessionUser({ _id: 'b' }));
  await registerForPush({ force: true });
  expect(calls.filter(isRegister)).toHaveLength(2); // a's, then b's
  expect(calls.filter(isRevoke)).toHaveLength(1);
});

it('kept while the server can\'t be reached, sent when the connection comes back', async () => {
  await signInAndRegister('a');
  await offlineLogout();

  online = false;
  const { unmount } = await restartApp(); // starts offline: the revoke fails
  await waitFor(() => expect(calls.filter(isRevoke)).toHaveLength(1));
  await act(async () => {});
  expect(pending()).toMatchObject({ userId: 'a' });

  online = true;
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  await waitFor(() => expect(calls.filter(isRevoke)).toHaveLength(2));
  await waitFor(() => expect(pending()).toBeNull());
  await unmount();
});

it('the revoke before a sign-in failed and that same account signed in: not revoked under it', async () => {
  await signInAndRegister('a');
  await offlineLogout();
  revokeReachable = false;
  await login('a@example.com', 'secret123'); // the revoke fails, the login goes through
  useAuthStore.getState().signIn('jwt-a2', sessionUser({ _id: 'a' }));
  revokeReachable = true;

  const { unmount } = await restartApp(); // start + registration, signed in as a
  await waitFor(() => expect(calls.filter(isRegister)).toHaveLength(2));
  await act(async () => {
    onlineManager.setOnline(false);
    onlineManager.setOnline(true);
  });
  expect(calls.filter(isRevoke)).toHaveLength(1); // only the failed one before the sign-in
  expect(pending()).toBeNull(); // a's registration replaced this device's entry
  await unmount();
});

it('the revoke never carries the current session (another account signed in)', async () => {
  await signInAndRegister('a');
  await offlineLogout();
  revokeReachable = false;
  await login('b@example.com', 'secret123');
  useAuthStore.getState().signIn('jwt-b', sessionUser({ _id: 'b' }));
  revokeReachable = true;

  const { unmount } = await restartApp(); // signed in as b, a's removal still pending
  await waitFor(() => expect(calls.filter(isRevoke)).toHaveLength(2));
  expect(calls.filter(isRevoke)[1]?.headers.Authorization ?? null).toBeNull();
  await waitFor(() => expect(calls.filter(isRegister)).toHaveLength(2));
  expect(calls.filter(isRegister)[1]?.headers.Authorization).toBe('Bearer jwt-b'); // others still do
  await waitFor(() => expect(pending()).toBeNull());
  await unmount();
});

it('signed out: a push that arrives while the app is open shows nothing', async () => {
  const handler = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0]?.[0] as {
    handleNotification: () => Promise<Record<string, boolean>>;
  };
  expect(Object.values(await handler.handleNotification()).some(Boolean)).toBe(false);

  useAuthStore.getState().signIn('jwt-a', sessionUser({ _id: 'a' }));
  const { unmount } = await restartApp();
  const received = (Notifications.addNotificationReceivedListener as jest.Mock).mock.calls.at(-1)?.[0] as (
    n: unknown,
  ) => void;
  // signed out: a push that the old listener still gets (one that arrives before it's removed)
  await act(async () => useAuthStore.setState({ status: 'signedOut', token: null, user: null }));
  received({ request: { identifier: 'n1', content: { title: 'MeetNet', body: 'Arjun liked your post', data: {} } } });
  expect(useUiStore.getState().banner).toBeNull();
  await unmount();
});

describe('only a definitive answer from the server changes the pending record', () => {
  it.each([
    ['429 (rate limited)', { status: 429, data: { message: 'Too many requests. Try again later.' } }],
    ['500', { status: 500, data: {} }],
    ['503', { status: 503, data: {} }],
    ['a timeout', 'timeout' as const],
    ['offline', 'network' as const],
  ])('%s keeps it exactly as it is; the next 2xx clears it', async (_name, reply) => {
    await signInAndRegister('a');
    await offlineLogout();
    const before = pending();
    revokeReply = reply;
    await flushPendingUnregister();
    expect(calls.filter(isRevoke)).toHaveLength(1);
    expect(pending()).toEqual(before); // no refusal counted, no wait before the next try

    revokeReply = null;
    await flushPendingUnregister(); // next start / reconnect / sign-in
    expect(calls.filter(isRevoke)).toHaveLength(2);
    expect(pending()).toBeNull();
  });

  it('no answer at all: it gives up waiting after REVOKE_TIMEOUT_MS and keeps the record', async () => {
    await signInAndRegister('a');
    await offlineLogout();
    revokeReply = 'hang';
    jest.useFakeTimers();
    try {
      let settled = false;
      const flush = flushPendingUnregister().then(() => {
        settled = true;
      });
      await jest.advanceTimersByTimeAsync(REVOKE_TIMEOUT_MS - 100);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(200);
      await flush;
      expect(settled).toBe(true); // a sign-in waiting for it goes on
    } finally {
      jest.useRealTimers();
    }
    expect(pending()).toMatchObject({ userId: 'a', token: TOKEN });
  });

  it.each([400, 403, 404, 410])(
    'a refusal (%i) is not retried on every start: again after 6 h, at most 3 times, then dropped',
    async (status) => {
      await signInAndRegister('a');
      await offlineLogout();
      revokeReply = { status, data: { message: 'refused' } };
      let t = Date.UTC(2026, 9, 12, 12);
      const now = jest.spyOn(Date, 'now').mockImplementation(() => t);
      try {
        await flushPendingUnregister();
        expect(pending()).toMatchObject({ refusals: 1, retryAt: t + REVOKE_REFUSED_RETRY_MS });
        // starts, reconnects and sign-ins in the meantime send nothing
        await flushPendingUnregister();
        t += REVOKE_REFUSED_RETRY_MS - 1000;
        await flushPendingUnregister();
        expect(calls.filter(isRevoke)).toHaveLength(1);

        t += 1000;
        await flushPendingUnregister();
        expect(pending()).toMatchObject({ refusals: 2 });
        t += REVOKE_REFUSED_RETRY_MS;
        await flushPendingUnregister();
        expect(pending()).toBeNull(); // the third refusal: dropped
        t += 30 * 24 * 60 * 60 * 1000;
        await flushPendingUnregister();
        expect(calls.filter(isRevoke)).toHaveLength(REVOKE_MAX_REFUSALS);
        // the server only ever gets the three fields, not the retry bookkeeping
        for (const c of calls.filter(isRevoke)) {
          expect(Object.keys(JSON.parse(String(c.data))).sort()).toEqual(['deviceId', 'token', 'userId']);
        }
      } finally {
        now.mockRestore();
      }
    },
  );

  it('a 2xx after a refusal clears it', async () => {
    await signInAndRegister('a');
    await offlineLogout();
    revokeReply = { status: 404, data: {} };
    let t = Date.UTC(2026, 9, 12, 12);
    const now = jest.spyOn(Date, 'now').mockImplementation(() => t);
    try {
      await flushPendingUnregister();
      expect(pending()).toMatchObject({ refusals: 1 });
      revokeReply = null; // the server has the route now
      t += REVOKE_REFUSED_RETRY_MS;
      await flushPendingUnregister();
      expect(pending()).toBeNull();
    } finally {
      now.mockRestore();
    }
  });
});
