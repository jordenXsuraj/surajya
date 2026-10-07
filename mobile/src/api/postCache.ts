import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import { queryKeys } from '@/api/queryKeys';
import type { Post } from '@/types/post';

// One post can sit in several cached feeds (home all/college, filtered types, following) and in
// its own post cache. Optimistic updates go through these helpers so every copy stays in sync.

export type FeedData = InfiniteData<Post[], number>;
export type CacheSnapshot = [QueryKey, unknown][];

const mapFeed = (
  data: FeedData | undefined,
  fn: (page: Post[]) => Post[],
): FeedData | undefined => {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((page) => {
    const next = fn(page);
    if (next !== page) changed = true;
    return next;
  });
  return changed ? { ...data, pages } : data;
};

/** Applies `updater` to the post with this id in every feed page and in the post cache. */
export function updatePost(qc: QueryClient, postId: string, updater: (post: Post) => Post): void {
  qc.setQueriesData<FeedData>({ queryKey: queryKeys.feeds }, (data) =>
    mapFeed(data, (page) =>
      page.some((p) => p._id === postId)
        ? page.map((p) => (p._id === postId ? updater(p) : p))
        : page,
    ),
  );
  qc.setQueryData<Post>(queryKeys.post(postId), (post) => (post ? updater(post) : post));
}

/** Removes matching posts from every cached feed (and their post caches). */
export function removePosts(qc: QueryClient, predicate: (post: Post) => boolean): void {
  qc.setQueriesData<FeedData>({ queryKey: queryKeys.feeds }, (data) =>
    mapFeed(data, (page) => (page.some(predicate) ? page.filter((p) => !predicate(p)) : page)),
  );
  for (const query of qc.getQueryCache().findAll({ queryKey: ['post'] })) {
    const post = query.state.data as Post | undefined;
    if (post && predicate(post)) qc.removeQueries({ queryKey: query.queryKey, exact: true });
  }
}

/** The freshest copy of a post we have: its own cache first, then any feed. */
export function findPost(qc: QueryClient, postId: string): Post | undefined {
  const own = qc.getQueryData<Post>(queryKeys.post(postId));
  if (own) return own;
  for (const [, data] of qc.getQueriesData<FeedData>({ queryKey: queryKeys.feeds })) {
    for (const page of data?.pages ?? []) {
      const hit = page.find((p) => p._id === postId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Everything a mutation might touch, to restore on error. */
export function snapshotPosts(qc: QueryClient, postId?: string): CacheSnapshot {
  const feeds = qc.getQueriesData({ queryKey: queryKeys.feeds });
  return postId
    ? [...feeds, [queryKeys.post(postId), qc.getQueryData(queryKeys.post(postId))]]
    : feeds;
}

export function restoreSnapshot(qc: QueryClient, snapshot: CacheSnapshot): void {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

/** Pull-to-refresh / tab re-tap: keep only page 1, then refetch it (like the web's reset to page 1). */
export async function refreshFeed(qc: QueryClient, key: QueryKey): Promise<void> {
  qc.setQueryData<FeedData>(key, (data) =>
    data && data.pages.length > 1
      ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
      : data,
  );
  await qc.refetchQueries({ queryKey: key, exact: true });
}
