import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import type { ReactNode } from 'react';

import { useAcceptTerms, useDeleteAccount } from '@/hooks/useAccount';
import { useReportReply } from '@/hooks/usePostMutations';
import {
  forgetPushRegistration,
  PUSH_PENDING_UNREGISTER_KEY,
  PUSH_REGISTERED_KEY,
  registerForPush,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { useUiStore } from '@/stores/ui.store';
import { mockApi, resetAll, secureStoreMap, sessionUser, type Reply } from '@/test/helpers';

// Prompt 7 (store readiness): account deletion in the app, the accept-terms screen and reply
// reports. The screens only wire these hooks up.

type Call = { method?: string; url?: string; data?: string };
let calls: Call[];
function serve(answer: (c: Call) => Reply | undefined) {
  calls = mockApi((c) => answer(c as Call) ?? { status: 200, data: { ok: true } }) as Call[];
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  resetAll();
  forgetPushRegistration();
  usePostUi.getState().reset();
  jest.mocked(Notifications.setBadgeCountAsync).mockClear();
  jest.mocked(Notifications.dismissAllNotificationsAsync).mockClear();
  serve(() => undefined);
  useAuthStore.getState().signIn('jwt', sessionUser({ _id: 'me' }));
  await registerForPush({ force: true }); // this phone gets the account's pushes
});

describe('delete account', () => {
  it('DELETE /users/me with the password, then everything local goes and the app signs out', async () => {
    // a removal left over from an earlier, offline logout of this same account
    secureStoreMap().set(
      PUSH_PENDING_UNREGISTER_KEY,
      JSON.stringify({ userId: 'me', deviceId: 'd-old', token: 'ExponentPushToken[old]' }),
    );
    serve((c) => (c.method === 'delete' && c.url === '/users/me' ? { status: 204 } : undefined));
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('my-password');
    });
    await flush();

    const del = calls.find((c) => c.method === 'delete' && c.url === '/users/me');
    expect(JSON.parse(del?.data ?? '{}')).toEqual({ password: 'my-password' });
    // the server already removed every push token: no DELETE /users/me/push-token, no new record
    expect(calls.some((c) => c.url === '/users/me/push-token' && c.method === 'delete')).toBe(false);
    expect(secureStoreMap().has(PUSH_REGISTERED_KEY)).toBe(false);
    expect(secureStoreMap().has(PUSH_PENDING_UNREGISTER_KEY)).toBe(false);
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);
    expect(Notifications.dismissAllNotificationsAsync).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', token: null, user: null });
    expect(useUiStore.getState().toast?.message).toBe('Your account was deleted');
  });

  it("keeps another account's pending removal (it still has to reach the server)", async () => {
    const other = { userId: 'someone-else', deviceId: 'd', token: 'ExponentPushToken[x]' };
    secureStoreMap().set(PUSH_PENDING_UNREGISTER_KEY, JSON.stringify(other));
    serve((c) => (c.method === 'delete' && c.url === '/users/me' ? { status: 204 } : undefined));
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('pw');
    });
    expect(JSON.parse(secureStoreMap().get(PUSH_PENDING_UNREGISTER_KEY) ?? 'null')).toEqual(other);
  });

  it('a wrong password keeps the session and says why', async () => {
    serve((c) =>
      c.url === '/users/me' && c.method === 'delete'
        ? { status: 400, data: { message: 'Incorrect password' } }
        : undefined,
    );
    const { result } = await renderHook(() => useDeleteAccount(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('wrong').catch(() => undefined);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toBe('Incorrect password');
    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(secureStoreMap().has(PUSH_REGISTERED_KEY)).toBe(true);
  });
});

describe('accept terms', () => {
  it('POST /users/me/accept-terms, and the session carries the date (the gate lifts)', async () => {
    serve((c) =>
      c.url === '/users/me/accept-terms'
        ? { status: 200, data: { termsAcceptedAt: '2026-10-13T09:00:00.000Z' } }
        : undefined,
    );
    expect(useAuthStore.getState().user?.termsAcceptedAt).toBeNull();
    const { result } = await renderHook(() => useAcceptTerms(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(calls.some((c) => c.method === 'post' && c.url === '/users/me/accept-terms')).toBe(true);
    expect(useAuthStore.getState().user?.termsAcceptedAt).toBe('2026-10-13T09:00:00.000Z');
  });
});

describe('report a reply', () => {
  it('goes to the reply report route and marks the reply reported', async () => {
    serve((c) =>
      c.url?.endsWith('/report')
        ? { status: 200, data: { message: 'Report submitted. Thank you.' } }
        : undefined,
    );
    const { result } = await renderHook(() => useReportReply(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ postId: 'p1', replyId: 'r1', reason: 'harassment' });
    });
    const call = calls.find((c) => c.url === '/posts/p1/replies/r1/report');
    expect(JSON.parse(call?.data ?? '{}')).toEqual({ reason: 'harassment' });
    expect(usePostUi.getState().reported.r1).toBe(true);
    expect(useUiStore.getState().toast?.message).toBe('Report submitted. Thank you.');
  });

  it('"already reported" counts as reported', async () => {
    serve((c) =>
      c.url?.endsWith('/report')
        ? { status: 400, data: { message: 'You already reported this reply' } }
        : undefined,
    );
    const { result } = await renderHook(() => useReportReply(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ postId: 'p1', replyId: 'r2', reason: 'spam' })
        .catch(() => undefined);
    });
    await waitFor(() => expect(usePostUi.getState().reported.r2).toBe(true));
    expect(useUiStore.getState().toast?.message).toBe('You already reported this reply');
  });
});
