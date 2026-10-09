import { request } from '@/api/client';
import { PAGE_SIZE } from '@/api/endpoints/posts';
import { uploadFile, type UploadFile } from '@/lib/upload';
import type { MessageResponse } from '@/types/api';
import type { Post } from '@/types/post';
import type { ReportReason } from '@/types/report';
import type {
  AvatarResponse,
  CoverResponse,
  Me,
  MediaItem,
  PersonRow,
  Project,
  PublicUser,
  Year,
} from '@/types/user';

export type ChangeEmailResponse = MessageResponse & { token: string; user: Me };

export const getMe = () => request<Me>({ method: 'GET', url: '/users/me' });

/** New address must be verified again; every other session ends and a new token comes back. */
export const changeEmail = (newEmail: string, password: string) =>
  request<ChangeEmailResponse>({
    method: 'PUT',
    url: '/users/me/email',
    data: { newEmail: newEmail.trim().toLowerCase(), password },
  });

/** Fields PUT /users/me accepts; send only the ones that changed. */
export type ProfileUpdate = Partial<{
  name: string;
  username: string;
  bio: string;
  year: Year;
  branch: string;
  skills: string[];
  projects: Project[];
  roadmap: string;
  mediaItems: Pick<MediaItem, 'type' | 'url'>[];
}>;

/**
 * 400 with a readable message ('Username already taken', 'Username too short' / 'too long',
 * 'Name cannot be empty' …). Answers with `following` / `pendingRequests` as plain ids.
 */
export const updateMe = (body: ProfileUpdate) =>
  request<Me>({ method: 'PUT', url: '/users/me', data: body });

type UploadOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

/** Field 'image'; JPG/PNG/WebP/HEIC, max 5 MB (the app sends a cropped 600×600 JPEG). */
export const uploadAvatar = (file: UploadFile, options?: UploadOptions) =>
  uploadFile<AvatarResponse>('/users/me/avatar', 'image', file, options);

/** Field 'image' (the app sends a cropped 1500×500 JPEG). */
export const uploadCover = (file: UploadFile, options?: UploadOptions) =>
  uploadFile<CoverResponse>('/users/me/cover', 'image', file, options);

/** My posts, newest first, anonymous ones included (shown as mine). */
export const getMyPosts = (page = 1) =>
  request<Post[]>({ method: 'GET', url: '/users/me/posts', params: { page, limit: PAGE_SIZE } });

/** The newest 20 saved posts (the server has no paging here). */
export const getSavedPosts = () => request<Post[]>({ method: 'GET', url: '/users/me/saved' });

export const getMyFollowers = () =>
  request<PersonRow[]>({ method: 'GET', url: '/users/followers' });

export const getMyFollowing = () =>
  request<PersonRow[]>({ method: 'GET', url: '/users/following' });

/** Follow requests waiting for my answer. */
export const getRequests = () => request<PersonRow[]>({ method: 'GET', url: '/users/requests' });

export const getBlocked = () => request<PersonRow[]>({ method: 'GET', url: '/users/me/blocked' });

/** 404 'User not found' also when either of us blocked the other. */
export const getUser = (id: string) => request<PublicUser>({ method: 'GET', url: `/users/${id}` });

/** Their newest 50 named posts (never anonymous ones; no paging on the server). */
export const getUserPosts = (id: string) =>
  request<Post[]>({ method: 'GET', url: `/users/${id}/posts` });

export const getUserFollowers = (id: string) =>
  request<PersonRow[]>({ method: 'GET', url: `/users/${id}/followers` });

export const getUserFollowing = (id: string) =>
  request<PersonRow[]>({ method: 'GET', url: `/users/${id}/following` });

/**
 * Follow request (403 EMAIL_NOT_VERIFIED for new unverified accounts, 403 when blocked; 400
 * 'Already following' / 'Request already sent' / 'User already requested you').
 */
export const connectUser = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/users/${id}/connect` });

/** They now follow me. 400 'No pending request' when they withdrew or it was answered elsewhere. */
export const acceptRequest = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/users/${id}/accept` });

export const rejectRequest = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/users/${id}/reject` });

export const unfollowUser = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/users/${id}/unfollow` });

/** Hides each other's profiles, named posts, replies, requests and notifications; ends follows. */
export const blockUser = (id: string) =>
  request<MessageResponse & { blocked: true }>({ method: 'POST', url: `/users/${id}/block` });

export const unblockUser = (id: string) =>
  request<MessageResponse & { blocked: false }>({ method: 'POST', url: `/users/${id}/unblock` });

/** 400 'You already reported this user' when reported before (403 EMAIL_NOT_VERIFIED too). */
export const reportUser = (id: string, reason: ReportReason, note?: string) =>
  request<MessageResponse>({
    method: 'POST',
    url: `/users/${id}/report`,
    data: { reason, ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) },
  });

/** Stops push notifications to this device (call before logging out). */
export const deletePushToken = (deviceId: string) =>
  request<{ ok: true }>({ method: 'DELETE', url: '/users/me/push-token', data: { deviceId } });
