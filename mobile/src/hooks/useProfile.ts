import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { PAGE_SIZE } from '@/api/endpoints/posts';
import {
  getBlocked,
  getMyFollowers,
  getMyFollowing,
  getMyPosts,
  getRequests,
  getSavedPosts,
  getUser,
  getUserFollowers,
  getUserFollowing,
  getUserPosts,
} from '@/api/endpoints/users';
import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { flattenFeed } from '@/hooks/useFeed';
import type { Post } from '@/types/post';

/** A hidden (blocked) or deleted profile won't come back by retrying. */
const retryUnlessGone = (count: number, error: unknown) =>
  count < 2 && !(error instanceof ApiError && (error.status === 404 || error.status === 400));

/** GET /users/:id/posts does not leave out expired "today only" posts; the feeds do. */
export const withoutExpired = (posts: Post[], now: number = Date.now()): Post[] =>
  posts.filter((p) => !p.expiresAt || new Date(p.expiresAt).getTime() > now);

/** My posts (anonymous ones too), pages of 20 like the feeds. */
export function useMyPosts() {
  return useInfiniteQuery({
    queryKey: queryKeys.myPosts,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => getMyPosts(pageParam),
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPageParam + 1,
    select: flattenFeed,
  });
}

export function useMySaved(enabled = true) {
  return useQuery({ queryKey: queryKeys.mySaved, queryFn: getSavedPosts, enabled });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.user(id),
    queryFn: () => getUser(id),
    enabled: Boolean(id),
    retry: retryUnlessGone,
  });
}

export function useUserPosts(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.userPosts(id),
    queryFn: () => getUserPosts(id),
    enabled: Boolean(id) && enabled,
    retry: retryUnlessGone,
    select: withoutExpired,
  });
}

/** Followers / following of me (`id` undefined) or of someone else. */
export function usePeople(kind: 'followers' | 'following', id?: string) {
  return useQuery({
    queryKey: id
      ? kind === 'followers'
        ? queryKeys.userFollowers(id)
        : queryKeys.userFollowing(id)
      : kind === 'followers'
        ? queryKeys.myFollowers
        : queryKeys.myFollowing,
    queryFn: () =>
      id
        ? kind === 'followers'
          ? getUserFollowers(id)
          : getUserFollowing(id)
        : kind === 'followers'
          ? getMyFollowers()
          : getMyFollowing(),
    retry: retryUnlessGone,
  });
}

/** Follow requests waiting for my answer. */
export function useRequests() {
  return useQuery({ queryKey: queryKeys.requests, queryFn: getRequests });
}

export function useBlocked() {
  return useQuery({ queryKey: queryKeys.blocked, queryFn: getBlocked });
}
