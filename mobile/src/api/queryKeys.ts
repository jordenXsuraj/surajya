import type { PostType } from '@/types/post';

export type FeedScope = 'college' | 'global' | 'following';
export type FeedType = PostType | 'all';

// All React Query keys in one place so invalidation stays consistent.
export const queryKeys = {
  me: ['me'] as const,
  feeds: ['feed'] as const,
  feed: (scope: FeedScope, type: FeedType) => ['feed', scope, type] as const,
  post: (id: string) => ['post', id] as const,
  user: (id: string) => ['user', id] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};
