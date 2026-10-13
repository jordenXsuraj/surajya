import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useChangePassword, useLogoutAllDevices } from '@/hooks/useAccount';
import { forgetPushRegistration, registerForPush } from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser, type Reply } from '@/test/helpers';

// A password change (or "log out all devices") makes the server drop EVERY device's push token,
// so a stolen phone stops getting this account's pushes (server/tests/pushTokens.test.js). This
// phone then registers again at once, with the new session: before, it kept the old token in
// memory, skipped the "unchanged" registration and got no pushes until the app restarted.

type Call = { method?: string; url?: string; headers: Record<string, unknown> };
const isRegistration = (c: Call) => c.method === 'post' && c.url === '/users/me/push-token';

let calls: Call[];
function serve(answer: (c: Call) => Reply | undefined) {
  calls = mockApi((c) => answer(c as Call) ?? { status: 200, data: { ok: true } }) as Call[];
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(async () => {
  resetAll();
  forgetPushRegistration();
  serve(() => undefined);
  useAuthStore.getState().signIn('jwt-old', sessionUser({ _id: 'a' }));
  await registerForPush({ force: true }); // registered with the old session, as at sign-in
});

it('a password change registers this phone again, with the new session', async () => {
  serve((c) => (c.url === '/auth/change-password' ? { status: 200, data: { message: 'ok', token: 'jwt-new' } } : undefined));
  const { result } = await renderHook(() => useChangePassword(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ current: 'old-pass-123', next: 'new-pass-456' });
  });
  await waitFor(() => expect(calls.filter(isRegistration)).toHaveLength(1));
  const order = calls.map((c) => c.url);
  expect(order.indexOf('/users/me/push-token')).toBeGreaterThan(order.indexOf('/auth/change-password'));
  expect(calls.find(isRegistration)?.headers.Authorization).toBe('Bearer jwt-new');
  expect(useAuthStore.getState().token).toBe('jwt-new');
});

it('"log out all devices" does the same', async () => {
  serve((c) => (c.url === '/auth/logout-all' ? { status: 200, data: { message: 'ok', token: 'jwt-new' } } : undefined));
  const { result } = await renderHook(() => useLogoutAllDevices(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync();
  });
  await waitFor(() => expect(calls.filter(isRegistration)).toHaveLength(1));
  expect(calls.find(isRegistration)?.headers.Authorization).toBe('Bearer jwt-new');
});

it('a refused change (wrong current password) registers nothing and keeps the session', async () => {
  serve((c) => (c.url === '/auth/change-password' ? { status: 400, data: { message: 'Current password is incorrect' } } : undefined));
  const { result } = await renderHook(() => useChangePassword(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ current: 'wrong-pass', next: 'new-pass-456' }).catch(() => undefined);
  });
  await act(async () => {});
  expect(calls.filter(isRegistration)).toHaveLength(0);
  expect(useAuthStore.getState().token).toBe('jwt-old');
});
