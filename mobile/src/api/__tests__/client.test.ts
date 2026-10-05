import { api, request } from '@/api/client';
import { ApiError } from '@/api/errors';
import { getMe } from '@/api/endpoints/users';
import { TOKEN_KEY, useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { mockApi, resetAll, secureStoreMap, sessionUser } from '@/test/helpers';

beforeEach(() => {
  resetAll();
  useAuthStore.getState().signIn('tok-1', sessionUser());
});

async function failure(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError);
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

describe('auth header', () => {
  it('sends the current token as a Bearer header', async () => {
    const calls = mockApi(() => ({ status: 200, data: {} }));
    await request({ url: '/users/me' });
    expect(calls[0]?.headers.Authorization).toBe('Bearer tok-1');
    expect(calls[0]?.baseURL).toBe('http://api.test/api');
  });
});

describe('401 handling', () => {
  it('401 with the current token logs out', async () => {
    mockApi(() => ({ status: 401, data: { message: 'Invalid token. Please log in.' } }));
    const error = await failure(getMe());
    expect(error.status).toBe(401);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(secureStoreMap().has(TOKEN_KEY)).toBe(false);
  });

  it('503 from the auth check (server trouble, e.g. database down) does not log out', async () => {
    const message = 'Service temporarily unavailable. Please try again.';
    mockApi(() => ({ status: 503, data: { message } }));
    const error = await failure(getMe());
    expect(error).toMatchObject({ status: 503, message });
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('every 401 for the current token logs out, whatever the message', async () => {
    mockApi(() => ({ status: 401, data: { message: 'Authentication failed' } }));
    await failure(getMe());
    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('401 for a request sent with an older token does not end the new session', async () => {
    mockApi(() => ({ status: 401, data: { message: 'Session expired. Please log in again.' } }));
    await failure(request({ url: '/users/me', headers: { Authorization: 'Bearer old-token' } }));
    expect(useAuthStore.getState()).toMatchObject({ status: 'signedIn', token: 'tok-1' });
  });

  it('network errors and timeouts never log out', async () => {
    mockApi(() => 'network');
    const offline = await failure(getMe());
    expect(offline).toMatchObject({ status: 0, message: 'No internet connection' });
    expect(offline.isNetworkError).toBe(true);

    mockApi(() => 'timeout');
    const slow = await failure(getMe());
    expect(slow.status).toBe(0);
    expect(slow.message).toMatch(/taking too long/);
    expect(useAuthStore.getState().status).toBe('signedIn');
  });
});

describe('403 EMAIL_NOT_VERIFIED', () => {
  it('opens the verify sheet with the server message', async () => {
    const message = 'Please verify your email address first. We sent a 6-digit code to your inbox.';
    mockApi(() => ({ status: 403, data: { code: 'EMAIL_NOT_VERIFIED', message } }));
    const error = await failure(request({ method: 'POST', url: '/posts' }));
    expect(error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(useUiStore.getState().verifySheet).toEqual({ visible: true, message });
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('other 403s do not open it', async () => {
    mockApi(() => ({ status: 403, data: { message: 'Not allowed' } }));
    await failure(request({ url: '/x' }));
    expect(useUiStore.getState().verifySheet.visible).toBe(false);
  });
});

describe('ApiError mapping', () => {
  it('keeps code, attemptsLeft and retryAfterSeconds', async () => {
    mockApi(() => ({
      status: 400,
      data: { code: 'INVALID_CODE', message: 'That code is not right.', attemptsLeft: 3 },
    }));
    expect(await failure(request({ url: '/auth/verify-email' }))).toMatchObject({
      status: 400,
      code: 'INVALID_CODE',
      attemptsLeft: 3,
      message: 'That code is not right.',
    });

    mockApi(() => ({
      status: 429,
      data: { code: 'RESEND_COOLDOWN', message: 'Please wait 42 seconds', retryAfterSeconds: 42 },
    }));
    expect(await failure(request({ url: '/auth/send-verification' }))).toMatchObject({
      status: 429,
      retryAfterSeconds: 42,
    });
  });

  it('uses a readable fallback when the body has no message (413, 5xx, non-JSON)', async () => {
    mockApi(() => ({ status: 413, data: '<html>Payload Too Large</html>' }));
    expect((await failure(request({ url: '/x' }))).message).toBe('That file is too large.');

    mockApi(() => ({ status: 502, data: undefined }));
    expect((await failure(request({ url: '/x' }))).message).toBe(
      'Something went wrong. Please try again.',
    );

    mockApi(() => ({
      status: 429,
      data: { message: 'Please wait a minute before asking for another code.' },
    }));
    const limited = await failure(request({ url: '/x' }));
    expect(limited.message).toBe('Please wait a minute before asking for another code.');
    expect(limited.retryAfterSeconds).toBeUndefined();
  });

  it('204 with no body resolves', async () => {
    mockApi(() => ({ status: 204, data: '' }));
    await expect(request({ method: 'DELETE', url: '/users/me' })).resolves.toBe('');
  });

  it('the axios instance has a 20 s timeout', () => {
    expect(api.defaults.timeout).toBe(20_000);
  });
});
