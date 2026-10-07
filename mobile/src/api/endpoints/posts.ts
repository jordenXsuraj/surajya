import { request } from '@/api/client';
import type { LikeResponse } from '@/lib/postView';
import type { MessageResponse } from '@/types/api';
import type { Post, Reply } from '@/types/post';
import type { ReportReason } from '@/types/report';

export const PAGE_SIZE = 20;

export type FeedParams = {
  /** '' or undefined = every type */
  type?: string;
  /** Posts from people I follow (never anonymous ones). */
  connections?: boolean;
  /** All colleges instead of my college. */
  global?: boolean;
  page?: number;
  limit?: number;
};

export const getFeed = ({ type, connections, global, page = 1, limit = PAGE_SIZE }: FeedParams) =>
  request<Post[]>({
    method: 'GET',
    url: '/posts',
    params: {
      ...(type ? { type } : {}),
      ...(connections ? { connections: 'true' } : {}),
      ...(global ? { global: 'true' } : {}),
      page,
      limit,
    },
  });

/** Works for share links and deep links: full replies, block-filtered, likedByMe. */
export const getPost = (id: string) => request<Post>({ method: 'GET', url: `/posts/${id}` });

/** Toggle. */
export const likePost = (id: string) =>
  request<LikeResponse>({ method: 'PUT', url: `/posts/${id}/like` });

/** Toggle. */
export const savePost = (id: string) =>
  request<{ saved: boolean }>({ method: 'PUT', url: `/posts/${id}/save` });

export const deletePost = (id: string) =>
  request<MessageResponse>({ method: 'DELETE', url: `/posts/${id}` });

/** 201 with the new reply (403 EMAIL_NOT_VERIFIED for new unverified accounts). */
export const addReply = (postId: string, text: string) =>
  request<Reply>({ method: 'POST', url: `/posts/${postId}/replies`, data: { text } });

export const deleteReply = (postId: string, replyId: string) =>
  request<MessageResponse>({ method: 'DELETE', url: `/posts/${postId}/replies/${replyId}` });

/** Notifies the author of a project post. The web posts a reply first (see INTEREST_TEXT). */
export const sendInterest = (id: string) =>
  request<MessageResponse>({ method: 'POST', url: `/posts/${id}/interested` });

/** 400 'You already reported this post' when reported before. */
export const reportPost = (id: string, reason: ReportReason, note?: string) =>
  request<MessageResponse>({
    method: 'POST',
    url: `/posts/${id}/report`,
    data: { reason, ...(note?.trim() ? { note: note.trim().slice(0, 300) } : {}) },
  });
