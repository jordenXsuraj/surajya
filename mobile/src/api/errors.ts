import type { ApiErrorBody } from '@/types/api';

// Every failed request becomes an ApiError. status 0 = no response (offline, timeout, DNS).
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly attemptsLeft?: number;
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, body?: ApiErrorBody | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (body?.code) this.code = body.code;
    if (typeof body?.attemptsLeft === 'number') this.attemptsLeft = body.attemptsLeft;
    if (typeof body?.retryAfterSeconds === 'number')
      this.retryAfterSeconds = body.retryAfterSeconds;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** An error whose message was written for the user (upload problems and the like). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export const OFFLINE_MESSAGE = 'You are offline';
export const SERVER_TROUBLE_MESSAGE = 'Something went wrong. Please try again.';

/**
 * Text that is safe to show. The API's 4xx messages and the client's own no-response texts are
 * written for users (server/API_MOBILE.md); a 5xx body, a native module's error or a JavaScript
 * exception never is, so those show `fallback` (5xx: "Something went wrong. Please try again.").
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) {
    if (error.status >= 500) return SERVER_TROUBLE_MESSAGE;
    return error.message || fallback;
  }
  if (error instanceof UserError) return error.message;
  return fallback;
}

/** True for a request that got no answer because the phone has no connection. */
export function isOffline(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'OFFLINE';
}
