import { refreshSession } from '@/api/session';
import { queryClient } from '@/lib/queryClient';
import { ENCRYPTION_KEY_NAME, getStorage } from '@/lib/storage';
import { TOKEN_KEY, USER_KEY, useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { me, mockApi, resetAll, secureStoreMap, sessionUser } from '@/test/helpers';

beforeEach(() => {
  resetAll();
  queryClient.clear();
});

function seedSession(token = 'tok-1') {
  secureStoreMap().set(TOKEN_KEY, token);
  getStorage().set(USER_KEY, JSON.stringify(sessionUser({ name: 'Cached Name' })));
}

describe('hydrate', () => {
  it('is signed out without a token', () => {
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', token: null, user: null });
  });

  it('is signed in at once with the cached user when a token exists (no loading gap)', () => {
    seedSession();
    useAuthStore.getState().hydrate();
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedIn');
    expect(state.token).toBe('tok-1');
    expect(state.user?.name).toBe('Cached Name');
  });

  it('drops a token that has no cached user', () => {
    secureStoreMap().set(TOKEN_KEY, 'tok-1');
    useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});

describe('refreshSession after hydrate', () => {
  it('200 → stays signed in with the fresh user', async () => {
    seedSession();
    useAuthStore.getState().hydrate();
    const calls = mockApi(() => ({ status: 200, data: me }));

    await refreshSession();

    expect(calls[0]?.headers.Authorization).toBe('Bearer tok-1');
    const state = useAuthStore.getState();
    expect(state.status).toBe('signedIn');
    expect(state.user?.name).toBe('Asha P.');
    expect(state.user?.emailVerified).toBe(true);
    expect(JSON.parse(getStorage().getString(USER_KEY) ?? '{}').name).toBe('Asha P.');
  });

  it('401 → signed out, token and cache cleared', async () => {
    seedSession();
    useAuthStore.getState().hydrate();
    mockApi(() => ({ status: 401, data: { message: 'Session expired. Please log in again.' } }));

    await refreshSession();

    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(secureStoreMap().has(TOKEN_KEY)).toBe(false);
    expect(getStorage().getString(USER_KEY)).toBeUndefined();
  });

  it('network error → stays signed in with the cached user (offline start)', async () => {
    seedSession();
    useAuthStore.getState().hydrate();
    mockApi(() => 'network');

    await refreshSession();

    expect(useAuthStore.getState().status).toBe('signedIn');
    expect(useAuthStore.getState().user?.name).toBe('Cached Name');
    expect(secureStoreMap().get(TOKEN_KEY)).toBe('tok-1');
  });
});

describe('signIn / logout', () => {
  it('signIn saves the token in SecureStore and the user in MMKV', () => {
    useAuthStore.getState().signIn('tok-9', sessionUser(), { pendingVerify: true });
    expect(secureStoreMap().get(TOKEN_KEY)).toBe('tok-9');
    expect(JSON.parse(getStorage().getString(USER_KEY) ?? '{}')._id).toBe('u1');
    expect(useAuthStore.getState()).toMatchObject({
      status: 'signedIn',
      token: 'tok-9',
      pendingVerify: true,
    });
  });

  it('logout clears the token, MMKV data, the query cache and UI state — but keeps the MMKV key', () => {
    useAuthStore.getState().signIn('tok-9', sessionUser());
    const key = secureStoreMap().get(ENCRYPTION_KEY_NAME);
    expect(key).toHaveLength(32);
    queryClient.setQueryData(['me'], { name: 'x' });
    getStorage().set('rq.cache', 'something');
    useUiStore.getState().showVerifySheet('msg');

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({ status: 'signedOut', token: null, user: null });
    expect(secureStoreMap().has(TOKEN_KEY)).toBe(false);
    expect(getStorage().getAllKeys()).toEqual([]);
    expect(queryClient.getQueryData(['me'])).toBeUndefined();
    expect(useUiStore.getState().verifySheet.visible).toBe(false);
    expect(secureStoreMap().get(ENCRYPTION_KEY_NAME)).toBe(key);
  });

  it('markCodeSent starts a 60 s resend wait; setResendWait honours retryAfterSeconds', () => {
    const now = Date.now();
    useAuthStore.getState().markCodeSent();
    expect(useAuthStore.getState().resendAvailableAt).toBeGreaterThanOrEqual(now + 60_000);
    useAuthStore.getState().setResendWait(25);
    expect(useAuthStore.getState().resendAvailableAt).toBeLessThan(now + 26_000 + 1000);
  });
});
