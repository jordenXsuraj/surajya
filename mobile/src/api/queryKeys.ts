import type { PostType } from '@/types/post';

export type FeedScope = 'college' | 'global' | 'following';
export type FeedType = PostType | 'all';

// All React Query keys in one place so invalidation stays consistent.
// Note: everything under ['me', …] starts with `me`; invalidate the signed-in user alone with
// `{ queryKey: queryKeys.me, exact: true }`.
export const queryKeys = {
  me: ['me'] as const,
  /** The signed-in user's own posts (GET /users/me/posts, infinite). */
  myPosts: ['me', 'posts'] as const,
  /** GET /users/me/saved (newest 20). */
  mySaved: ['me', 'saved'] as const,
  myFollowers: ['me', 'followers'] as const,
  myFollowing: ['me', 'following'] as const,
  /** Follow requests waiting for my answer (GET /users/requests). */
  requests: ['me', 'requests'] as const,
  blocked: ['me', 'blocked'] as const,
  feeds: ['feed'] as const,
  feed: (scope: FeedScope, type: FeedType) => ['feed', scope, type] as const,
  followingFeed: ['feed', 'following'] as const,
  post: (id: string) => ['post', id] as const,
  /** Everything about one other user: profile, posts, lists. */
  userAll: (id: string) => ['user', id] as const,
  user: (id: string) => ['user', id, 'profile'] as const,
  userPosts: (id: string) => ['user', id, 'posts'] as const,
  userFollowers: (id: string) => ['user', id, 'followers'] as const,
  userFollowing: (id: string) => ['user', id, 'following'] as const,
  /** Connect suggestions (Prompt 6); invalidated when relations change. */
  suggestions: ['suggestions'] as const,
  notifications: ['notifications'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};
