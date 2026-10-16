import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';

import { changePassword, logoutAllDevices } from '@/api/endpoints/auth';
import {
  acceptTerms,
  deleteAccount,
  deletePushToken,
  updateMe,
  type ProfileUpdate,
} from '@/api/endpoints/users';
import { errorMessage } from '@/api/errors';
import { updateAuthor } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import { applyMe } from '@/api/session';
import {
  forgetPushRegistration,
  logPushFailure,
  PUSH_DEVICE_KEY,
  registerForPush,
  settlePushAccountDeleted,
  settlePushLogout,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import type { Me } from '@/types/user';

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

/**
 * PUT /users/me with the changed fields. Errors go back to the form (username messages are shown
 * under the field). The answer has the lists as plain ids, so the populated ones are kept.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ProfileUpdate) => updateMe(body),
    onSuccess: (updated, body) => {
      const token = useAuthStore.getState().token;
      const previous = qc.getQueryData<Me>(queryKeys.me);
      const merged: Me = previous
        ? {
            ...previous,
            ...updated,
            following: previous.following,
            pendingRequests: previous.pendingRequests,
          }
        : updated;
      qc.setQueryData(queryKeys.me, merged);
      applyMe(merged, token);
      if (body.name) {
        const myId = useAuthStore.getState().user?._id;
        if (myId) updateAuthor(qc, String(myId), { name: updated.name });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      toast('✅ Profile updated!', 'success');
    },
  });
}

/** Other devices are logged out; this one carries on with the new token. */
/**
 * After a password change or "log out all devices" the server drops every device's push token
 * (a stolen phone stops getting this account's pushes) and hands this phone a new session: this
 * phone registers again right away, with that new session, so only it keeps getting pushes.
 */
const registerThisDeviceAgain = () => void registerForPush({ force: true }).catch(logPushFailure);

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(current, next),
    onSuccess: ({ token }) => {
      useAuthStore.getState().setToken(token);
      registerThisDeviceAgain();
      toast('✅ Password changed. Other devices were logged out.', 'success');
    },
  });
}

export function useLogoutAllDevices() {
  return useMutation({
    mutationFn: logoutAllDevices,
    onSuccess: ({ token }) => {
      useAuthStore.getState().setToken(token);
      registerThisDeviceAgain();
      toast('✅ Logged out of all other devices', 'success');
    },
    onError: (error) => toast(`❌ ${errorMessage(error, 'Something went wrong')}`, 'error'),
  });
}

/** Accept-terms screen: POST /users/me/accept-terms, then the session user carries the date. */
export function useAcceptTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: acceptTerms,
    onSuccess: ({ termsAcceptedAt }) => {
      useAuthStore.getState().updateUser({ termsAcceptedAt });
      qc.setQueryData<Me>(queryKeys.me, (me) => (me ? { ...me, termsAcceptedAt } : me));
    },
  });
}

/**
 * After DELETE /users/me (204) the account is gone on the server, push tokens included, so this
 * sends nothing: it forgets the push registration (no pending removal), clears the app badge and
 * the account's notifications, then everything else (logout → welcome).
 */
export function deleteAccountLocally(userId: string): void {
  settlePushAccountDeleted(userId);
  forgetPushRegistration();
  void Notifications.setBadgeCountAsync(0).catch(() => undefined);
  void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  useAuthStore.getState().logout();
}

/** Delete account screen; errors (wrong password, offline, 429) go back to the screen. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: (password: string) => deleteAccount(password),
    onSuccess: () => {
      deleteAccountLocally(String(useAuthStore.getState().user?._id ?? ''));
      toast('Your account was deleted', 'success');
    },
  });
}

/** Longest the logout waits for the server to forget this device's push token. */
export const SIGN_OUT_PUSH_TIMEOUT_MS = 3000;

/**
 * Log out: first tell the server to stop pushes to this device (if it was registered), then clear
 * everything. Signing out never depends on that call: offline, 401, 5xx or no answer at all, the
 * user is signed out locally after at most SIGN_OUT_PUSH_TIMEOUT_MS.
 */
export async function signOut(): Promise<void> {
  let deviceId: string | null = null;
  try {
    deviceId = SecureStore.getItem(PUSH_DEVICE_KEY);
  } catch {
    deviceId = null;
  }
  let removed = false;
  if (deviceId) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    removed = await Promise.race([
      deletePushToken(deviceId).then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), SIGN_OUT_PUSH_TIMEOUT_MS);
      }),
    ]);
    clearTimeout(timer);
  }
  // Not removed (offline, 401, 5xx, no answer): kept as a pending removal, sent once possible
  settlePushLogout(removed);
  forgetPushRegistration();
  void Notifications.setBadgeCountAsync(0).catch(() => undefined);
  // The account's notifications already in the shade / on the lock screen go too
  void Notifications.dismissAllNotificationsAsync().catch(() => undefined);
  useAuthStore.getState().logout();
}
