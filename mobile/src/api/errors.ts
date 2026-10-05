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

export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
