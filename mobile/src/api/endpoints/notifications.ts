import { request } from '@/api/client';

export const getUnreadCount = () =>
  request<{ count: number }>({ method: 'GET', url: '/notifications/unread-count' });
