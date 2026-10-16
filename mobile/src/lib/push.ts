import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { registerPushToken, revokePushToken, type PushRegistration } from '@/api/endpoints/users';
import { ApiError } from '@/api/errors';
import { getStorage } from '@/lib/storage';
import { useAuthStore } from '@/stores/auth.store';
import { colors } from '@/theme/tokens';

// Push notifications (expo-notifications → Expo push service → FCM / APNs). The server sends
// every push without a channelId, so on Android they land in the channel with id "default".

/** SecureStore key of this install's push device id; DELETE /users/me/push-token uses it. */
export const PUSH_DEVICE_KEY = 'push.deviceId';

export const PUSH_CHANNEL_ID = 'default';

/** SecureStore: account, device id and Expo token of this install's last successful registration. */
export const PUSH_REGISTERED_KEY = 'push.registered';
/**
 * SecureStore: a logout whose DELETE didn't reach the server (offline, 401, 5xx, no answer), so
 * the phone would keep getting that account's pushes. Sent again as POST /users/push-token/revoke
 * on the next start, when the connection comes back and before the next sign-in, then removed.
 * It holds no session (the login token is deleted at logout as always): the Expo push token is
 * the proof that this is the device the account registered, and no endpoint ever returns tokens.
 */
export const PUSH_PENDING_UNREGISTER_KEY = 'push.pendingUnregister';

/** MMKV: when the soft pre-prompt was last shown ("Not now" waits this long before asking again). */
const PROMPT_AT_KEY = 'push.promptAt';
export const PROMPT_AGAIN_MS = 14 * 24 * 60 * 60 * 1000;

const platform = Platform.OS === 'ios' ? 'ios' : 'android';

// Foreground pushes don't show the system alert: the app shows its own banner instead (see
// usePushNotifications). Background and killed-state pushes are shown by the system as usual.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Android 8+: the channel must exist before the permission prompt (Android 13+ shows the prompt
 * only once an app has a channel) and before the first push.
 */
export async function ensurePushChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'MeetNet',
    description: 'Follow requests, likes, replies and interest in your posts',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: colors.accent,
    vibrationPattern: [0, 180, 120, 180],
    showBadge: true,
  });
}

/** One random id per install, kept in SecureStore (it survives logout, not a reinstall). */
export function pushDeviceId(): string {
  try {
    const existing = SecureStore.getItem(PUSH_DEVICE_KEY);
    if (existing) return existing;
  } catch {
    // unreadable Keystore entry: make a new id
  }
  const id = Crypto.randomUUID();
  try {
    SecureStore.setItem(PUSH_DEVICE_KEY, id);
  } catch {
    // still usable for this session
  }
  return id;
}

function readRegistration(key: string): PushRegistration | null {
  try {
    const raw = SecureStore.getItem(key);
    return raw ? (JSON.parse(raw) as PushRegistration) : null;
  } catch {
    return null;
  }
}

function writeRegistration(key: string, value: PushRegistration | null): void {
  try {
    if (value) SecureStore.setItem(key, JSON.stringify(value));
    else void SecureStore.deleteItemAsync(key).catch(() => undefined);
  } catch {
    // best effort: a stale record is only sent once more
  }
}

export type PushPermission = { granted: boolean; canAskAgain: boolean };

export async function pushPermission(): Promise<PushPermission> {
  const status = await Notifications.getPermissionsAsync();
  return { granted: status.granted, canAskAgain: status.canAskAgain };
}

/** The system prompt (Android 13+ POST_NOTIFICATIONS, iOS alert/badge/sound). */
export async function requestPushPermission(): Promise<PushPermission> {
  await ensurePushChannel();
  const status = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return { granted: status.granted, canAskAgain: status.canAskAgain };
}

/** Whether Home should show the soft pre-prompt now. */
export function shouldOfferPushPrompt(
  permission: PushPermission,
  lastShownAt: number | null,
  now: number = Date.now(),
): boolean {
  if (permission.granted || !permission.canAskAgain) return false;
  return lastShownAt === null || now - lastShownAt >= PROMPT_AGAIN_MS;
}

export function pushPromptShownAt(): number | null {
  try {
    return getStorage().getNumber(PROMPT_AT_KEY) ?? null;
  } catch {
    return null;
  }
}

export function markPushPromptShown(now: number = Date.now()): void {
  try {
    getStorage().set(PROMPT_AT_KEY, now);
  } catch {
    // shown again next time
  }
}

const projectId = (): string | undefined =>
  Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

let lastRegistered: string | null = null;
let promptOfferedThisSession = false;

/** The pre-prompt opens at most once per app session (and then waits PROMPT_AGAIN_MS). */
export function takePushPromptTurn(): boolean {
  if (promptOfferedThisSession) return false;
  promptOfferedThisSession = true;
  return true;
}

let lastDeviceToken: string | null = null;
let inFlight: Promise<boolean> | null = null;
/**
 * The server answered 429 (too many registrations): no more tries in this app session, whatever
 * asks (start, return to the front, token listener). The next app start tries again.
 */
let rateLimitedThisSession = false;

/** Longest one registration may take before the next call may start a new one. */
export const REGISTER_TIMEOUT_MS = 30_000;

/**
 * After a failure that can pass on its own (no connection, timeout, server error, no FCM token
 * yet), registration tries again by itself after these delays, so a token isn't left unsent until
 * the next return to the front. Not after a 4xx: 429 already stops the session, the others won't
 * change by waiting. At most 4 extra requests: well inside the server's 10 an hour.
 */
export const REGISTER_RETRY_MS = [5_000, 30_000, 120_000, 300_000];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesUsed = 0;

const mayPass = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 0 || error.status >= 500;

/** Development builds only: a failed registration has no UI, so the reason goes to the log. */
export function logPushFailure(error: unknown): void {
  if (!__DEV__ || process.env.NODE_ENV === 'test') return;
  const e = error as { code?: string; message?: string };
  console.warn(`[push] registration failed: ${e?.code ?? ''} ${e?.message ?? String(error)}`);
}

function scheduleRetry(): void {
  if (retryTimer || retriesUsed >= REGISTER_RETRY_MS.length) return;
  const delay = REGISTER_RETRY_MS[retriesUsed++] ?? 0;
  if (__DEV__ && process.env.NODE_ENV !== 'test')
    console.log(`[push] trying again in ${delay / 1000} s`);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    registerForPush({ force: true }).catch(logPushFailure);
  }, delay);
}

/** Sign-out: no more tries for this session's account. */
export function cancelPushRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retriesUsed = 0;
}

async function register(force: boolean): Promise<boolean> {
  if (rateLimitedThisSession) return false;
  const { granted } = await pushPermission();
  if (!granted) return false;
  await ensurePushChannel();
  // Fetched once and handed on: getExpoPushTokenAsync would fetch it again, and every fetch fires
  // addPushTokenListener (which would register again: a loop of POSTs)
  const device = await Notifications.getDevicePushTokenAsync();
  lastDeviceToken = String(device.data);
  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId: projectId(),
    devicePushToken: device,
  });
  if (!force && token === lastRegistered) return true;
  const deviceId = pushDeviceId();
  try {
    await registerPushToken({ token, platform, deviceId });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) rateLimitedThisSession = true;
    throw error;
  }
  lastRegistered = token;
  const userId = useAuthStore.getState().user?._id;
  if (userId) writeRegistration(PUSH_REGISTERED_KEY, { userId, deviceId, token });
  // The server took this token from every other account and replaced this device's entry: an
  // older logout's pending removal for the same token, or for this account, is done
  const pending = readRegistration(PUSH_PENDING_UNREGISTER_KEY);
  if (pending && (pending.token === token || pending.userId === userId)) {
    writeRegistration(PUSH_PENDING_UNREGISTER_KEY, null);
  }
  return true;
}

/**
 * Sends this device's Expo push token to the server (POST /users/me/push-token, an upsert by
 * deviceId). Without permission it does nothing. `force` re-sends the same token (sign-in, or a
 * token change reported by addPushTokenListener). A call while one is running gets that one.
 */
export function registerForPush(options: { force?: boolean } = {}): Promise<boolean> {
  if (inFlight) return inFlight;
  // A registration that never settles (no FCM token, no answer) must not block every later one
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('push registration timed out')), REGISTER_TIMEOUT_MS);
  });
  inFlight = Promise.race([register(options.force ?? false), timeout])
    .then(
      (done) => {
        cancelPushRetry(); // sent, or nothing to send (no permission, rate limited)
        return done;
      },
      (error: unknown) => {
        if (mayPass(error)) scheduleRetry();
        throw error;
      },
    )
    .finally(() => {
      clearTimeout(timer);
      inFlight = null;
    });
  return inFlight;
}

/**
 * For addPushTokenListener: true only when the device token really changed. Fetching the token
 * (which registration does) fires the listener too, with the token it already has.
 */
export function isNewDevicePushToken(data: unknown): boolean {
  const value = String(data);
  if (value === lastDeviceToken) return false;
  lastDeviceToken = value;
  return true;
}

/**
 * Logout: `removed` says whether DELETE /users/me/push-token reached the server. If it didn't,
 * this device's registration becomes the pending removal (see PUSH_PENDING_UNREGISTER_KEY).
 */
export function settlePushLogout(removed: boolean): void {
  const registered = readRegistration(PUSH_REGISTERED_KEY);
  writeRegistration(PUSH_REGISTERED_KEY, null);
  if (!removed && registered) writeRegistration(PUSH_PENDING_UNREGISTER_KEY, registered);
}

/**
 * The account was deleted (DELETE /users/me): the server already dropped all of its push tokens,
 * so there is nothing left to remove. Forgets this install's registration and any pending removal
 * kept for that account, without writing a new one.
 */
export function settlePushAccountDeleted(userId: string): void {
  writeRegistration(PUSH_REGISTERED_KEY, null);
  if (readRegistration(PUSH_PENDING_UNREGISTER_KEY)?.userId === userId) {
    writeRegistration(PUSH_PENDING_UNREGISTER_KEY, null);
  }
}

/** Longest a pending removal may hold up a sign-in. */
export const REVOKE_TIMEOUT_MS = 3000;
/**
 * A refusal (4xx other than 408/429: malformed, or a server without the route) won't pass by
 * retrying on every start: the next try waits REVOKE_REFUSED_RETRY_MS, and after
 * REVOKE_MAX_REFUSALS refusals the record is dropped (at most 3 requests over ~12 h).
 */
export const REVOKE_MAX_REFUSALS = 3;
export const REVOKE_REFUSED_RETRY_MS = 6 * 60 * 60 * 1000;
let revoking: Promise<void> | null = null;

type PendingUnregister = PushRegistration & { refusals?: number; retryAt?: number };

const isRefusal = (error: unknown) =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 408 &&
  error.status !== 429;

/**
 * Sends the pending removal, if any (app start, back online, before a sign-in). Never throws and
 * settles within REVOKE_TIMEOUT_MS. Only the server's answer changes the record: 2xx clears it, a
 * refusal counts (see REVOKE_MAX_REFUSALS); offline, timeouts, 429 and 5xx leave it as it is.
 */
export function flushPendingUnregister(): Promise<void> {
  if (revoking) return revoking;
  const pending = readRegistration(PUSH_PENDING_UNREGISTER_KEY) as PendingUnregister | null;
  // That account signed in here again: its next registration replaces the entry instead
  if (!pending || pending.userId === useAuthStore.getState().user?._id) return Promise.resolve();
  if (pending.retryAt && Date.now() < pending.retryAt) return Promise.resolve();
  // Only while it is still the record this attempt was about (not a newer logout's)
  const update = (next: PendingUnregister | null) => {
    const now = readRegistration(PUSH_PENDING_UNREGISTER_KEY);
    if (now?.token === pending.token && now.userId === pending.userId) {
      writeRegistration(PUSH_PENDING_UNREGISTER_KEY, next);
    }
  };
  const { userId, deviceId, token } = pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  revoking = Promise.race([
    revokePushToken({ userId, deviceId, token }).then(
      () => update(null),
      (error: unknown) => {
        if (!isRefusal(error)) return;
        const refusals = (pending.refusals ?? 0) + 1;
        update(
          refusals >= REVOKE_MAX_REFUSALS
            ? null
            : { ...pending, refusals, retryAt: Date.now() + REVOKE_REFUSED_RETRY_MS },
        );
      },
    ),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, REVOKE_TIMEOUT_MS);
    }),
  ]).finally(() => {
    clearTimeout(timer);
    revoking = null;
  });
  return revoking;
}

/** Logout: the next sign-in registers again. */
export function forgetPushRegistration(): void {
  cancelPushRetry();
  lastRegistered = null;
  lastDeviceToken = null;
  promptOfferedThisSession = false;
}
