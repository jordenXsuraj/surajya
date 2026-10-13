import { create } from 'zustand';

export const DEFAULT_VERIFY_MESSAGE = 'Please verify your email address first.';

type ToastType = 'info' | 'success' | 'error';

/** A push that arrived while the app was open: shown at the top, tapping opens `href`. */
export type PushBanner = { id: number; title: string; body: string; href: string };

type UiState = {
  /** Bottom sheet shown when the API answers 403 EMAIL_NOT_VERIFIED. */
  verifySheet: { visible: boolean; message: string };
  /** Home verify banner dismissed for this app session (web: sessionStorage). */
  verifyBannerDismissed: boolean;
  /** One toast at a time; `id` changes on every show so the same text re-animates. */
  toast: { id: number; message: string; type: ToastType } | null;
  banner: PushBanner | null;

  showVerifySheet: (message?: string) => void;
  hideVerifySheet: () => void;
  dismissVerifyBanner: () => void;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
  showBanner: (banner: Omit<PushBanner, 'id'>) => void;
  hideBanner: () => void;
  reset: () => void;
};

let toastId = 0;

export const useUiStore = create<UiState>()((set) => ({
  verifySheet: { visible: false, message: DEFAULT_VERIFY_MESSAGE },
  verifyBannerDismissed: false,
  toast: null,
  banner: null,

  showVerifySheet: (message) =>
    set({ verifySheet: { visible: true, message: message || DEFAULT_VERIFY_MESSAGE } }),
  hideVerifySheet: () => set((s) => ({ verifySheet: { ...s.verifySheet, visible: false } })),
  dismissVerifyBanner: () => set({ verifyBannerDismissed: true }),
  showToast: (message, type = 'info') => set({ toast: { id: ++toastId, message, type } }),
  hideToast: () => set({ toast: null }),
  showBanner: (banner) => set({ banner: { ...banner, id: ++toastId } }),
  hideBanner: () => set({ banner: null }),
  reset: () =>
    set({
      verifySheet: { visible: false, message: DEFAULT_VERIFY_MESSAGE },
      verifyBannerDismissed: false,
      toast: null,
      banner: null,
    }),
}));
