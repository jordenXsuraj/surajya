import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { persister, queryClient } from '@/lib/queryClient';
import { clearCache, getStorage, readJson, writeJson } from '@/lib/storage';
import { usePostUi } from '@/stores/postUi.store';
import { useSignupDraft } from '@/stores/signupDraft.store';
import { useUiStore } from '@/stores/ui.store';
import type { SessionUser } from '@/types/user';

export const TOKEN_KEY = 'auth.token';
export const USER_KEY = 'auth.user';
export const RESEND_SECONDS = 60;

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  token: string | null;
  user: SessionUser | null;
  /** Set by signup: the tabs layout opens /verify-email once the signed-in stack is mounted. */
  pendingVerify: boolean;
  /** When "Resend code" becomes available (ms). Every successful send starts a 60 s wait. */
  resendAvailableAt: number;

  /** Synchronous start-up: token from SecureStore, cached user from MMKV. No loading gap. */
  hydrate: () => void;
  signIn: (token: string, user: SessionUser, options?: { pendingVerify?: boolean }) => void;
  setUser: (user: SessionUser) => void;
  updateUser: (patch: Partial<SessionUser>) => void;
  clearPendingVerify: () => void;
  markCodeSent: () => void;
  setResendWait: (seconds: number) => void;
  logout: () => void;
};

function readToken(): string | null {
  try {
    return SecureStore.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'loading',
  token: null,
  user: null,
  pendingVerify: false,
  resendAvailableAt: 0,

  hydrate: () => {
    const token = readToken();
    const user = token ? readJson<SessionUser>(USER_KEY) : null;
    if (token && user) {
      set({ status: 'signedIn', token, user });
    } else {
      // A token without a cached user (or the reverse) is an interrupted sign-in: start clean.
      if (token) void SecureStore.deleteItemAsync(TOKEN_KEY);
      set({ status: 'signedOut', token: null, user: null });
    }
  },

  signIn: (token, user, options) => {
    SecureStore.setItem(TOKEN_KEY, token);
    writeJson(USER_KEY, user);
    set({ status: 'signedIn', token, user, pendingVerify: options?.pendingVerify ?? false });
  },

  setUser: (user) => {
    if (get().status !== 'signedIn') return;
    writeJson(USER_KEY, user);
    set({ user });
  },

  updateUser: (patch) => {
    const current = get().user;
    if (current) get().setUser({ ...current, ...patch });
  },

  clearPendingVerify: () => set({ pendingVerify: false }),

  markCodeSent: () => set({ resendAvailableAt: Date.now() + RESEND_SECONDS * 1000 }),

  setResendWait: (seconds) => set({ resendAvailableAt: Date.now() + seconds * 1000 }),

  logout: () => {
    void SecureStore.deleteItemAsync(TOKEN_KEY);
    queryClient.clear();
    void persister.removeClient();
    clearCache(); // wipes MMKV data; the encryption key in SecureStore stays
    useUiStore.getState().reset();
    usePostUi.getState().reset();
    useSignupDraft.getState().clear();
    set({
      status: 'signedOut',
      token: null,
      user: null,
      pendingVerify: false,
      resendAvailableAt: 0,
    });
  },
}));

/** Opens storage early so a broken Keystore shows up at start-up, not mid-session. */
export function bootstrapAuth(): void {
  getStorage();
  useAuthStore.getState().hydrate();
}
