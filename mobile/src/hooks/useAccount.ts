import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';

import { changePassword, logoutAllDevices } from '@/api/endpoints/auth';
import { deletePushToken, updateMe, type ProfileUpdate } from '@/api/endpoints/users';
import { errorMessage } from '@/api/errors';
import { updateAuthor } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import { applyMe } from '@/api/session';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import type { Me } from '@/types/user';

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

/** SecureStore key of this install's push device id (created by push registration, Prompt 6). */
export const PUSH_DEVICE_KEY = 'push.deviceId';

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
export function useChangePassword() {
  return useMutation({
    mutationFn: ({ current, next }: { current: string; next: string }) =>
      changePassword(current, next),
    onSuccess: ({ token }) => {
      useAuthStore.getState().setToken(token);
      toast('✅ Password changed. Other devices were logged out.', 'success');
    },
  });
}

export function useLogoutAllDevices() {
  return useMutation({
    mutationFn: logoutAllDevices,
    onSuccess: ({ token }) => {
      useAuthStore.getState().setToken(token);
      toast('✅ Logged out of all other devices', 'success');
    },
    onError: (error) => toast(`❌ ${errorMessage(error, 'Something went wrong')}`, 'error'),
  });
}

/**
 * Log out: first tell the server to stop pushes to this device (if it was registered; any
 * failure is ignored and never holds the user up for more than 3 s), then clear everything.
 */
export async function signOut(): Promise<void> {
  let deviceId: string | null = null;
  try {
    deviceId = SecureStore.getItem(PUSH_DEVICE_KEY);
  } catch {
    deviceId = null;
  }
  if (deviceId) {
    await Promise.race([
      deletePushToken(deviceId).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  useAuthStore.getState().logout();
}
