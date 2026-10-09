import { request } from '@/api/client';
import type { SignupRequest } from '@/lib/validation';
import type { MessageResponse } from '@/types/api';
import type { AuthUser } from '@/types/user';

export type AuthResponse = { token: string; user: AuthUser };

export type SendVerificationResponse = MessageResponse & {
  expiresInSeconds: number;
  resendAfterSeconds: number;
};

export type VerifyEmailResponse = MessageResponse & { user: AuthUser };

export const signup = (body: SignupRequest) =>
  request<AuthResponse>({ method: 'POST', url: '/auth/signup', data: body });

/** Wrong credentials answer 400 'Invalid email or password' (never 401). */
export const login = (email: string, password: string) =>
  request<AuthResponse>({
    method: 'POST',
    url: '/auth/login',
    data: { email: email.trim().toLowerCase(), password },
  });

export const sendVerification = () =>
  request<SendVerificationResponse>({ method: 'POST', url: '/auth/send-verification' });

/** Code is sent as a string so leading zeros survive. */
export const verifyEmail = (code: string) =>
  request<VerifyEmailResponse>({ method: 'POST', url: '/auth/verify-email', data: { code } });

export const forgotPassword = (email: string) =>
  request<MessageResponse>({ method: 'POST', url: '/auth/forgot-password', data: { email } });

/** Ends every other session; this device continues with the new token (replace the stored one). */
export const logoutAllDevices = () =>
  request<MessageResponse & { token: string }>({ method: 'POST', url: '/auth/logout-all' });

/**
 * 400 for a wrong current password, a new one under 8 characters or the same as before. Other
 * devices are logged out; this one continues with the new token.
 */
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<MessageResponse & { token: string }>({
    method: 'POST',
    url: '/auth/change-password',
    data: { currentPassword, newPassword },
  });
