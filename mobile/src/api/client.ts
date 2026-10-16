import { onlineManager } from '@tanstack/react-query';
import { AxiosError, create, type AxiosRequestConfig } from 'axios';

import { ApiError, OFFLINE_MESSAGE, SERVER_TROUBLE_MESSAGE } from '@/api/errors';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import type { ApiErrorBody } from '@/types/api';

// The only module that talks HTTP. Screens use the endpoint modules + React Query hooks.

// Read as a whole expression: Expo inlines EXPO_PUBLIC_* at build time.
const API_URL = process.env.EXPO_PUBLIC_API_URL;

export const TIMEOUT_MS = 20_000;

export const api = create({ baseURL: API_URL, timeout: TIMEOUT_MS });

api.interceptors.request.use((config) => {
  if (!API_URL) {
    // A build without the variable is broken: say why in development, nothing technical to users
    throw new ApiError(
      0,
      __DEV__
        ? 'EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env.local.'
        : SERVER_TROUBLE_MESSAGE,
    );
  }
  const token = useAuthStore.getState().token;
  // null: a request that must go without the session (POST /users/push-token/revoke)
  if (token && config.headers.Authorization === undefined) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);

function fallbackMessage(status: number): string {
  if (status === 413) return 'That file is too large.';
  if (status === 429) return 'Too many requests. Please try again later.';
  if (status >= 500) return 'Something went wrong. Please try again.';
  return 'Request failed';
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (!(error instanceof AxiosError)) {
    if (__DEV__ && process.env.NODE_ENV !== 'test')
      console.warn('[api] request failed before it was sent:', error);
    return new ApiError(0, SERVER_TROUBLE_MESSAGE);
  }

  // Stopped on purpose (AbortController), e.g. removing a photo while it uploads
  if (error.code === AxiosError.ERR_CANCELED) {
    return new ApiError(0, 'Request cancelled', { code: 'CANCELLED' });
  }

  // No response: offline, DNS, timeout, server asleep. Never a reason to sign out.
  if (!error.response) {
    const timedOut = error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT;
    if (timedOut) {
      return new ApiError(0, 'The server is taking too long to respond. Please try again.');
    }
    // NetInfo knows there is no connection (code OFFLINE); otherwise the server was unreachable
    if (!onlineManager.isOnline()) return new ApiError(0, OFFLINE_MESSAGE, { code: 'OFFLINE' });
    return new ApiError(0, 'No internet connection');
  }

  const { status, data } = error.response;
  const body: ApiErrorBody | null =
    data && typeof data === 'object' ? (data as ApiErrorBody) : null;
  const message = body?.message || fallbackMessage(status);
  const apiError = new ApiError(status, message, body);

  // 401 = the session is over. Server-side trouble during the auth check is 503 (status >= 500
  // never signs out). Only end the session the request was made with: a request still in flight
  // with an old token (e.g. right after changing email) must not sign out the new session.
  if (status === 401) {
    const sentWith = String(error.config?.headers?.Authorization ?? '');
    const { token, logout } = useAuthStore.getState();
    if (token && sentWith === `Bearer ${token}`) logout();
  }

  if (status === 403 && body?.code === 'EMAIL_NOT_VERIFIED') {
    useUiStore.getState().showVerifySheet(message);
  }

  return apiError;
}

/** Typed request helper used by the endpoint modules. */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await api.request<T>(config);
  return response.data;
}
