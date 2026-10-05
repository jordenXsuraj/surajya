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

export const logoutAllDevices = () =>
  request<MessageResponse>({ method: 'POST', url: '/auth/logout-all' });
