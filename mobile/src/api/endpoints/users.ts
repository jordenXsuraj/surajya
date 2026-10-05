import { request } from '@/api/client';
import type { MessageResponse } from '@/types/api';
import type { Me } from '@/types/user';

export type ChangeEmailResponse = MessageResponse & { token: string; user: Me };

export const getMe = () => request<Me>({ method: 'GET', url: '/users/me' });

/** New address must be verified again; every other session ends and a new token comes back. */
export const changeEmail = (newEmail: string, password: string) =>
  request<ChangeEmailResponse>({
    method: 'PUT',
    url: '/users/me/email',
    data: { newEmail: newEmail.trim().toLowerCase(), password },
  });

/** Follow request (403 EMAIL_NOT_VERIFIED for new unverified accounts, 403 when blocked). */
export const connectUser = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/users/${id}/connect` });

/** Hides each other's profiles, named posts, replies, requests and notifications; ends follows. */
export const blockUser = (id: string) =>
  request<MessageResponse & { blocked: true }>({ method: 'POST', url: `/users/${id}/block` });
