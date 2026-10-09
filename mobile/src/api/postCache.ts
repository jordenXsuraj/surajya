import type { InfiniteData, Query, QueryClient, QueryKey } from '@tanstack/react-query';

import { queryKeys } from '@/api/queryKeys';
import type { Post, PostAuthor } from '@/types/post';

// One post can sit in several cached lists (home all/college, filtered types, following, my
// posts, my saved posts, someone's profile) and in its own post cache. Optimistic updates go
// through these helpers so every copy stays in sync.

export type FeedData = InfiniteData<Post[], number>;
/** Feeds and my posts are infinite; saved posts and a user's posts are plain arrays. */
type PostList = FeedData | Post[];
export type CacheSnapshot = [QueryKey, unknown][];

/** Every cached list of posts: feeds, my posts, my saved posts, another user's posts. */
export const isPostListKey = (key: QueryKey): boolean =>
  key[0] === 'feed' ||
  (key[0] === 'me' && (key[1] === 'posts' || key[1] === 'saved')) ||
  (key[0] === 'user' && key[2] === 'posts');

const allPostLists = { predicate: (query: Query) => isPostListKey(query.queryKey) };

// Posts this user created in this app session stay at the top of Home's first page for a while,
// also after a refetch: the server ranks posts from people you follow above your own new post, so
// it would otherwise jump down a moment after "✅ Posted!". Ids only, kept in memory; this also
// covers anonymous posts, whose author the feed never shows.
export const PIN_OWN_POSTS_MS = 10 * 60_000;
let recentOwnPosts: { id: string; userId: string; at: number }[] = [];

export function rememberOwnPost(postId: string, userId: string, now: number = Date.now()): void {
  recentOwnPosts = [
    { id: postId, userId, at: now },
    ...recentOwnPosts.filter((r) => r.id !== postId && now - r.at < PIN_OWN_POSTS_MS),
  ];
}

/** The user's posts from the last 10 minutes of this session first (newest first), then the rest. */
export function pinRecentOwnPosts(
  posts: Post[],
  userId: string | undefined,
  now: number = Date.now(),
): Post[] {
  if (!userId) return posts;
  const ids = recentOwnPosts
    .filter((r) => r.userId === userId && now - r.at < PIN_OWN_POSTS_MS)
    .map((r) => r.id);
  const pinned = ids.flatMap((id) => posts.filter((p) => p._id === id));
  if (pinned.length === 0) return posts;
  return [...pinned, ...posts.filter((p) => !ids.includes(p._id))];
}

/** Tests only. */
export function forgetOwnPosts(): void {
  recentOwnPosts = [];
}

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

const mapList = (data: PostList | undefined, fn: (page: Post[]) => Post[]): PostList | undefined =>
  Array.isArray(data) ? fn(data) : mapFeed(data, fn);

const pagesOf = (data: PostList | undefined): Post[][] =>
  !data ? [] : Array.isArray(data) ? [data] : data.pages;

/** Applies `updater` to the post with this id in every cached list and in the post cache. */
export function updatePost(qc: QueryClient, postId: string, updater: (post: Post) => Post): void {
  qc.setQueriesData<PostList>(allPostLists, (data) =>
    mapList(data, (page) =>
      page.some((p) => p._id === postId)
        ? page.map((p) => (p._id === postId ? updater(p) : p))
        : page,
    ),
  );
  qc.setQueryData<Post>(queryKeys.post(postId), (post) => (post ? updater(post) : post));
}

/**
 * Removes matching posts from every cached list (and their post caches), or only from the lists
 * under `scope` (e.g. the Following feed after an unfollow), leaving the post caches alone.
 */
export function removePosts(
  qc: QueryClient,
  predicate: (post: Post) => boolean,
  scope?: QueryKey,
): void {
  qc.setQueriesData<PostList>(scope ? { queryKey: scope } : allPostLists, (data) =>
    mapList(data, (page) => (page.some(predicate) ? page.filter((p) => !predicate(p)) : page)),
  );
  if (scope) return;
  for (const query of qc.getQueryCache().findAll({ queryKey: ['post'] })) {
    const post = query.state.data as Post | undefined;
    if (post && predicate(post)) qc.removeQueries({ queryKey: query.queryKey, exact: true });
  }
}

/**
 * The signed-in user changed their name or photo: patch their posts and replies in every cached
 * list and post, so cards show the new one without a refetch. Anonymous posts carry no author.
 */
export function updateAuthor(
  qc: QueryClient,
  userId: string,
  patch: Partial<Pick<PostAuthor, 'name' | 'avatar'>>,
): void {
  const mine = (author: PostAuthor | null | undefined) => !!author && String(author._id) === userId;
  const patchPost = (post: Post): Post => {
    const ownPost = mine(post.postedBy);
    const ownReplies = post.replies?.some((r) => mine(r.postedBy)) ?? false;
    if (!ownPost && !ownReplies) return post;
    return {
      ...post,
      ...(ownPost && post.postedBy ? { postedBy: { ...post.postedBy, ...patch } } : {}),
      ...(ownReplies
        ? {
            replies: post.replies.map((r) =>
              mine(r.postedBy) && r.postedBy ? { ...r, postedBy: { ...r.postedBy, ...patch } } : r,
            ),
          }
        : {}),
    };
  };
  qc.setQueriesData<PostList>(allPostLists, (data) =>
    mapList(data, (page) => {
      const next = page.map(patchPost);
      return next.some((p, i) => p !== page[i]) ? next : page;
    }),
  );
  for (const query of qc.getQueryCache().findAll({ queryKey: ['post'] })) {
    const post = query.state.data as Post | undefined;
    const next = post && patchPost(post);
    if (next && next !== post) qc.setQueryData<Post>(query.queryKey, next);
  }
}

/** The freshest copy of a post we have: its own cache first, then any list. */
export function findPost(qc: QueryClient, postId: string): Post | undefined {
  const own = qc.getQueryData<Post>(queryKeys.post(postId));
  if (own) return own;
  for (const [, data] of qc.getQueriesData<PostList>(allPostLists)) {
    for (const page of pagesOf(data)) {
      const hit = page.find((p) => p._id === postId);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Everything a mutation might touch, to restore on error. */
export function snapshotPosts(qc: QueryClient, postId?: string): CacheSnapshot {
  const lists = qc.getQueriesData(allPostLists);
  return postId
    ? [...lists, [queryKeys.post(postId), qc.getQueryData(queryKeys.post(postId))]]
    : lists;
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

/**
 * A post the user just created: put it at the top of page 1 of every cached Home feed it belongs
 * to (college and all colleges, "all" and its own type) and of the user's own posts.
 * The Following feed only has other people's posts, so it is left alone.
 */
export function insertNewPost(qc: QueryClient, post: Post): void {
  for (const query of qc.getQueryCache().findAll({ queryKey: queryKeys.feeds })) {
    const [, scope, type] = query.queryKey as [string, string, string];
    if (scope === 'following' || (type !== 'all' && type !== post.type)) continue;
    qc.setQueryData<FeedData>(query.queryKey, (data) => {
      if (!data || data.pages.length === 0) return data;
      const [first, ...rest] = data.pages;
      return {
        ...data,
        pages: [[post, ...(first ?? []).filter((p) => p._id !== post._id)], ...rest],
      };
    });
  }
  qc.setQueryData<FeedData>(queryKeys.myPosts, (data) => {
    if (!data || data.pages.length === 0) return data;
    const [first, ...rest] = data.pages;
    return {
      ...data,
      pages: [[post, ...(first ?? []).filter((p) => p._id !== post._id)], ...rest],
    };
  });
}
