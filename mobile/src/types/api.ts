// Error bodies are always JSON `{ message }`, sometimes with a machine-readable code.
export type ApiErrorCode =
  | 'EMAIL_NOT_VERIFIED'
  | 'ALREADY_VERIFIED'
  | 'RESEND_COOLDOWN'
  | 'INVALID_CODE'
  | 'CODE_LOCKED'
  | 'CODE_EXPIRED'
  | 'EMAIL_TAKEN'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE';

export type ApiErrorBody = {
  message?: string;
  code?: ApiErrorCode | string;
  attemptsLeft?: number;
  retryAfterSeconds?: number;
};

export type MessageResponse = { message: string };

export type ObjectId = string;
export type IsoDate = string;
