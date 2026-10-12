import * as Notifications from 'expo-notifications';

import { signOut } from '@/hooks/useAccount';
import {
  forgetPushRegistration,
  isNewDevicePushToken,
  PUSH_DEVICE_KEY,
  pushDeviceId,
  registerForPush,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, secureStoreMap, sessionUser } from '@/test/helpers';

// The push token across an app's life: restart, token refresh, logout, another account on the
// same phone. The server side of the same cases is server/tests/pushTokens.test.js.

const getDevice = Notifications.getDevicePushTokenAsync as jest.Mock;
const getExpo = Notifications.getExpoPushTokenAsync as jest.Mock;

const signInAs = (id: string) =>
  useAuthStore.getState().signIn(`jwt-${id}`, sessionUser({ _id: id, name: `User ${id}` }));

type Call = { method?: string; url?: string; data?: unknown; headers?: Record<string, unknown> };
const body = (c: Call) => JSON.parse(String(c.data ?? '{}')) as Record<string, string>;
const auth = (c: Call) => String(c.headers?.Authorization ?? '');

beforeEach(() => {
  resetAll();
  forgetPushRegistration();
  getDevice.mockResolvedValue({ type: 'android', data: 'fcm-1' });
  getExpo.mockImplementation(async ({ devicePushToken }: { devicePushToken: { data: string } }) => ({
    type: 'expo',
    data: `ExponentPushToken[${devicePushToken.data}]`,
  }));
});

describe('push token lifecycle', () => {
  it('app restart: a fresh start registers once, with the device id the phone kept', async () => {
    signInAs('a');
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await registerForPush({ force: true });
    const deviceId = pushDeviceId();
    expect(secureStoreMap().get(PUSH_DEVICE_KEY)).toBe(deviceId);

    // The restart: a new module registry (new auth store, API client and push state; nothing
    // registered in memory). Only what SecureStore holds survives, as on the phone.
    const afterRestart: Call[] = [];
    await jest.isolateModulesAsync(async () => {
      const store = jest.requireMock<{ __store: Map<string, string> }>('expo-secure-store').__store;
      store.set(PUSH_DEVICE_KEY, deviceId);
      const helpers = jest.requireActual<typeof import('@/test/helpers')>('@/test/helpers');
      const { useAuthStore: freshAuth } = jest.requireActual<typeof import('@/stores/auth.store')>('@/stores/auth.store');
      const push = jest.requireActual<typeof import('@/lib/push')>('@/lib/push');
      freshAuth.getState().signIn('jwt-a', sessionUser({ _id: 'a' }));
      const restartCalls = helpers.mockApi(() => ({ status: 200, data: { ok: true } }));
      // what usePushNotifications does on every signed-in start
      await push.registerForPush({ force: true });
      await push.registerForPush(); // the same start, e.g. back to the front: nothing new to send
      afterRestart.push(...restartCalls);
    });

    const posts = afterRestart.filter((c) => c.method === 'post');
    expect(posts).toHaveLength(1);
    expect(body(posts[0]!)).toEqual({ token: 'ExponentPushToken[fcm-1]', platform: 'ios', deviceId });
    expect(auth(posts[0]!)).toBe('Bearer jwt-a');
    expect(calls.filter((c) => c.method === 'post')).toHaveLength(1); // the first run's one
  });

  it('token refresh: only a really new device token registers again, with the new token', async () => {
    signInAs('a');
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await registerForPush({ force: true });

    // the listener event that the fetch itself causes
    expect(isNewDevicePushToken('fcm-1')).toBe(false);

    // FCM rotated the token
    getDevice.mockResolvedValue({ type: 'android', data: 'fcm-2' });
    expect(isNewDevicePushToken('fcm-2')).toBe(true);
    await registerForPush({ force: true });

    const posts = calls.filter((c) => c.method === 'post');
    expect(posts.map((c) => body(c).token)).toEqual([
      'ExponentPushToken[fcm-1]',
      'ExponentPushToken[fcm-2]',
    ]);
    expect(body(posts[0]!).deviceId).toBe(body(posts[1]!).deviceId);
  });

  it('logout: unregisters this device first, then signs out; the next sign-in registers again', async () => {
    signInAs('a');
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await registerForPush({ force: true });
    const deviceId = pushDeviceId();

    await signOut();
    const del = calls.find((c) => c.method === 'delete');
    expect(del?.url).toBe('/users/me/push-token');
    expect(body(del!)).toEqual({ deviceId });
    expect(auth(del!)).toBe('Bearer jwt-a');
    expect(useAuthStore.getState().status).toBe('signedOut');
    expect(Notifications.setBadgeCountAsync).toHaveBeenCalledWith(0);

    // same token, same phone: after a sign-in it is sent again (not skipped as "already sent")
    signInAs('a');
    await registerForPush();
    expect(calls.filter((c) => c.method === 'post')).toHaveLength(2);
  });

  it('another account on the same phone: the token goes to the new account', async () => {
    signInAs('a');
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await registerForPush({ force: true });
    await signOut();

    signInAs('b');
    await registerForPush({ force: true });

    const [postA, del, postB] = calls.filter((c) => c.url === '/users/me/push-token');
    expect([postA?.method, del?.method, postB?.method]).toEqual(['post', 'delete', 'post']);
    expect(auth(postA!)).toBe('Bearer jwt-a');
    expect(auth(del!)).toBe('Bearer jwt-a'); // removed from A while still signed in as A
    expect(auth(postB!)).toBe('Bearer jwt-b');
    expect(body(postB!).token).toBe(body(postA!).token);
    expect(body(postB!).deviceId).toBe(body(postA!).deviceId);
  });
});
