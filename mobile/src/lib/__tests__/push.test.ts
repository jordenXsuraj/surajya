import * as Notifications from 'expo-notifications';

import {
  forgetPushRegistration,
  isNewDevicePushToken,
  PROMPT_AGAIN_MS,
  PUSH_DEVICE_KEY,
  pushDeviceId,
  registerForPush,
  shouldOfferPushPrompt,
  takePushPromptTurn,
} from '@/lib/push';
import { mockApi, resetAll, secureStoreMap } from '@/test/helpers';

const getPermissions = Notifications.getPermissionsAsync as jest.Mock;

beforeEach(() => {
  resetAll();
  forgetPushRegistration();
  getPermissions.mockResolvedValue({ granted: true, canAskAgain: true, status: 'granted' });
});

describe('soft pre-prompt', () => {
  const now = Date.UTC(2026, 9, 9);

  it('only when the system can still ask, and not again within 14 days', () => {
    const undecided = { granted: false, canAskAgain: true };
    expect(shouldOfferPushPrompt(undecided, null, now)).toBe(true);
    expect(shouldOfferPushPrompt(undecided, now - PROMPT_AGAIN_MS + 1000, now)).toBe(false);
    expect(shouldOfferPushPrompt(undecided, now - PROMPT_AGAIN_MS, now)).toBe(true);
    expect(shouldOfferPushPrompt({ granted: true, canAskAgain: true }, null, now)).toBe(false);
    expect(shouldOfferPushPrompt({ granted: false, canAskAgain: false }, null, now)).toBe(false);
  });

  it('once per app session; logout gives the next sign-in a turn', () => {
    expect(takePushPromptTurn()).toBe(true);
    expect(takePushPromptTurn()).toBe(false);
    forgetPushRegistration();
    expect(takePushPromptTurn()).toBe(true);
  });
});

describe('registration', () => {
  it('keeps one device id per install in SecureStore', () => {
    const id = pushDeviceId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pushDeviceId()).toBe(id);
    expect(secureStoreMap().get(PUSH_DEVICE_KEY)).toBe(id);
  });

  it('sends token, platform and device id once (again when forced)', async () => {
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await expect(registerForPush()).resolves.toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe('post');
    expect(calls[0]!.url).toBe('/users/me/push-token');
    expect(JSON.parse(calls[0]!.data as string)).toEqual({
      token: 'ExponentPushToken[test-token]',
      platform: 'ios', // jest-expo runs as iOS by default
      deviceId: pushDeviceId(),
    });

    await registerForPush();
    expect(calls).toHaveLength(1); // same token: nothing to send
    await registerForPush({ force: true });
    expect(calls).toHaveLength(2);
  });

  it('never loops: the device token is fetched once, its own listener event is ignored', async () => {
    // Regression: getExpoPushTokenAsync fetched the device token again, every fetch fires
    // addPushTokenListener, and the listener registered again: 4159 POSTs in a few minutes
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    const getDevice = Notifications.getDevicePushTokenAsync as jest.Mock;
    const getExpo = Notifications.getExpoPushTokenAsync as jest.Mock;
    getDevice.mockClear();
    getExpo.mockClear();

    await Promise.all([registerForPush({ force: true }), registerForPush({ force: true })]);
    expect(calls).toHaveLength(1); // the second call joined the running one
    expect(getDevice).toHaveBeenCalledTimes(1);
    expect(getExpo).toHaveBeenCalledWith(
      expect.objectContaining({ devicePushToken: { type: 'android', data: 'fcm-device-token' } }),
    );

    // the listener event that fetching the token causes: same token → no new registration
    expect(isNewDevicePushToken('fcm-device-token')).toBe(false);
    // a real rotation → register again
    expect(isNewDevicePushToken('fcm-device-token-2')).toBe(true);
  });

  it('does nothing without permission', async () => {
    getPermissions.mockResolvedValue({ granted: false, canAskAgain: true, status: 'denied' });
    const calls = mockApi(() => ({ status: 200, data: { ok: true } }));
    await expect(registerForPush({ force: true })).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });
});
