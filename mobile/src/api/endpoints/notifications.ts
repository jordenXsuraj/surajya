import { request } from '@/api/client';
import type { MessageResponse } from '@/types/api';
import type { Notification } from '@/types/notification';

/** Server default (max 50). */
export const NOTIFICATIONS_PAGE_SIZE = 25;

export const getUnreadCount = () =>
  request<{ count: number }>({ method: 'GET', url: '/notifications/unread-count' });

/**
 * Unread first, then newest; sender populated (`name year branch college avatar`), post as
 * `{ type, text }`. Notifications from blocked users (either way) are left out.
 */
export const getNotifications = (page: number) =>
  request<Notification[]>({
    method: 'GET',
    url: '/notifications',
    params: { page, limit: NOTIFICATIONS_PAGE_SIZE },
  });

export const markAllNotificationsRead = () =>
  request<{ success: true }>({ method: 'PUT', url: '/notifications/mark-read' });

export const markNotificationRead = (id: string) =>
  request<MessageResponse>({ method: 'PUT', url: `/notifications/${id}/read` });
