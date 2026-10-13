import * as Notifications from 'expo-notifications';

import { SIGN_OUT_PUSH_TIMEOUT_MS, signOut } from '@/hooks/useAccount';
import {
  isNewDevicePushToken,
  pushDeviceId,
  REGISTER_TIMEOUT_MS,
  registerForPush,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';

// When the push-token calls fail. A file of its own: after a 429 the push module stops trying for
// the rest of the "app session", which in Jest is this file's module registry.

const signIn = () => useAuthStore.getState().signIn('jwt-a', sessionUser({ _id: 'a' }));
const posts = (calls: { method?: string }[]) => calls.filter((c) => c.method === 'post');

beforeEach(() => {
  resetAll();
  (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ type: 'android', data: 'fcm-1' });
});

describe('signOut when DELETE /users/me/push-token fails', () => {
  beforeEach(() => {
    signIn();
    pushDeviceId(); // a registered device: signOut sends the DELETE
  });

  it.each([
    ['offline', 'network' as const],
    ['401', { status: 401, data: { message: 'Not authorized' } }],
    ['500', { status: 500, data: { message: 'Server error' } }],
    ['503', { status: 503, data: {} }],
  ])('%s: still signs out locally', async (_name, reply) => {
    const calls = mockApi(() => reply);
    await signOut();
    expect(calls.some((c) => c.method === 'delete' && c.url === '/users/me/push-token')).toBe(true);
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(useAuthStore.getState().token).toBeNull();
  });

  it('no answer at all: signs out after the short timeout', async () => {
    jest.useFakeTimers();
    try {
      mockApi(() => new Promise(() => {})); // the request never settles
      let done = false;
      const pending = signOut().then(() => {
        done = true;
      });
      await jest.advanceTimersByTimeAsync(SIGN_OUT_PUSH_TIMEOUT_MS - 100);
      expect(done).toBe(false); // still waiting for the server, at most a few seconds
      await jest.advanceTimersByTimeAsync(200);
      await pending;
      expect(done).toBe(true);
      expect(useAuthStore.getState().status).toBe('signedOut');
      expect(SIGN_OUT_PUSH_TIMEOUT_MS).toBeLessThanOrEqual(3000);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('a registration that never finishes (no FCM token)', () => {
  it('times out, and the next attempt starts fresh', async () => {
    signIn();
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    jest.useFakeTimers();
    try {
      (Notifications.getDevicePushTokenAsync as jest.Mock).mockReturnValueOnce(new Promise(() => {}));
      const hung = registerForPush({ force: true });
      const outcome = hung.then(
        () => 'resolved',
        (e: Error) => e.message,
      );
      await jest.advanceTimersByTimeAsync(REGISTER_TIMEOUT_MS);
      await expect(outcome).resolves.toBe('push registration timed out');
    } finally {
      jest.useRealTimers();
    }
    // not blocked by the hung one: FCM answers now
    await expect(registerForPush({ force: true })).resolves.toBe(true);
    expect(posts(calls)).toHaveLength(1);
  });
});

describe('429 on POST /users/me/push-token', () => {
  it('stops trying for the rest of the app session; the next app start tries again', async () => {
    signIn();
    const calls = mockApi((c) =>
      c.method === 'post'
        ? { status: 429, data: { message: 'Too many push token updates. Try again later.' } }
        : { status: 200, data: { ok: true } },
    );

    await expect(registerForPush({ force: true })).rejects.toMatchObject({ status: 429 });
    // everything that would register again in this session: start effect, back to the front,
    // and the token listener after a rotation
    await expect(registerForPush({ force: true })).resolves.toBe(false);
    await expect(registerForPush()).resolves.toBe(false);
    (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ type: 'android', data: 'fcm-2' });
    if (isNewDevicePushToken('fcm-2')) await registerForPush({ force: true });
    expect(posts(calls)).toHaveLength(1); // the one that got the 429, no retries

    // the next app start: a fresh module registry, the server accepts again
    let restartPosts = 0;
    await jest.isolateModulesAsync(async () => {
      const helpers = jest.requireActual<typeof import('@/test/helpers')>('@/test/helpers');
      const { useAuthStore: freshAuth } = jest.requireActual<typeof import('@/stores/auth.store')>('@/stores/auth.store');
      const push = jest.requireActual<typeof import('@/lib/push')>('@/lib/push');
      freshAuth.getState().signIn('jwt-a', sessionUser({ _id: 'a' }));
      const fresh = helpers.mockApi(() => ({ status: 200, data: { ok: true } }));
      await expect(push.registerForPush({ force: true })).resolves.toBe(true);
      restartPosts = posts(fresh).length;
    });
    expect(restartPosts).toBe(1);
  });
});
