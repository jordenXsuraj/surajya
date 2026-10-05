import { useInfiniteQuery } from '@tanstack/react-query';

import { getFeed, PAGE_SIZE } from '@/api/endpoints/posts';
import type { FeedData } from '@/api/postCache';
import { queryKeys, type FeedScope, type FeedType } from '@/api/queryKeys';
import { smartSort } from '@/lib/ranking';
import { useAuthStore } from '@/stores/auth.store';
import type { Post } from '@/types/post';

/** Flattens the pages; a post can come back twice when new posts shift the pages (web dedupes too). */
export function flattenFeed(data: FeedData): Post[] {
  const seen = new Set<string>();
  const posts: Post[] = [];
  for (const page of data.pages) {
    for (const post of page) {
      if (post && !seen.has(post._id)) {
        seen.add(post._id);
        posts.push(post);
      }
    }
  }
  return posts;
}

/**
 * Home (college / all colleges) and Following feeds. Pages of 20; a shorter page is the last one.
 * Home pages are ranked with the web's client-side scoring as they arrive (Following stays
 * newest-first, like the web).
 */
export function useFeed(scope: FeedScope, type: FeedType = 'all') {
  return useInfiniteQuery({
    queryKey: queryKeys.feed(scope, type),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const posts = await getFeed({
        type: type === 'all' ? '' : type,
        connections: scope === 'following',
        global: scope === 'global',
        page: pageParam,
        limit: PAGE_SIZE,
      });
      if (scope === 'following') return posts;
      return smartSort(posts, useAuthStore.getState().user?.followingIds ?? []);
    },
    getNextPageParam: (lastPage, _all, lastPageParam) =>
      lastPage.length < PAGE_SIZE ? undefined : lastPageParam + 1,
    select: flattenFeed,
  });
}
