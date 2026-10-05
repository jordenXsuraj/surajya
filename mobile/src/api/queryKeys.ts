// All React Query keys in one place so invalidation stays consistent.
export const queryKeys = {
  me: ['me'] as const,
  feed: (filter: string) => ['feed', filter] as const,
  post: (id: string) => ['post', id] as const,
  user: (id: string) => ['user', id] as const,
  notifications: ['notifications'] as const,
};
