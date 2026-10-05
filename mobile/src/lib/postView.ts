import type { Post, PostAuthor, Reply } from '@/types/post';

// Ported from nexusnetwork/src/utils/postView.js. On anonymous posts the API hides the author:
// replies by the author come back as { postedBy: null, isAuthor: true } (+ isMine for the author),
// and the author's id is removed from `likes`; likeCount / likedByMe carry the real values.

export const INTEREST_TEXT = "🙋 I'm interested in collaborating!";

export const likeCountOf = (post: Pick<Post, 'likeCount' | 'likes'>): number =>
  post.likeCount ?? (post.likes ?? []).length;

export const isLikedBy = (
  post: Pick<Post, 'likedByMe' | 'likes'>,
  uid: string | undefined,
): boolean => post.likedByMe ?? (!!uid && (post.likes ?? []).map(String).includes(uid));

/** Optimistic like toggle that keeps likes / likeCount / likedByMe in sync. */
export function toggleLike(post: Post, uid: string): Post {
  const already = isLikedBy(post, uid);
  return {
    ...post,
    likes: already
      ? (post.likes ?? []).filter((l) => String(l) !== uid)
      : [...(post.likes ?? []), uid],
    likeCount: Math.max(0, likeCountOf(post) + (already ? -1 : 1)),
    likedByMe: !already,
  };
}

export type LikeResponse = { liked: boolean; count?: number; likeCount?: number; likes?: string[] };

/** Merges the PUT /posts/:id/like answer into a post. */
export const applyLikeResponse = (post: Post, data: LikeResponse): Post => ({
  ...post,
  likes: data.likes ?? post.likes,
  likeCount: data.likeCount ?? data.count ?? (data.likes ?? []).length,
  likedByMe: data.liked,
});

export const isAnonAuthorReply = (reply: Reply): boolean =>
  !reply.postedBy && reply.isAuthor === true;

export const replyAuthorName = (reply: Reply): string =>
  isAnonAuthorReply(reply) ? 'Anonymous (author)' : reply.postedBy?.name || 'User';

export const isOwnReply = (reply: Reply, uid: string | undefined): boolean =>
  Boolean(reply.isMine) || (!!uid && String(reply.postedBy?._id ?? '') === uid);

/** The named author, or null for anonymous posts (never try to identify those). */
export const visibleAuthor = (post: Post): PostAuthor | null =>
  post.isAnonymous || !post.postedBy ? null : post.postedBy;

export const isOwnPost = (post: Post, uid: string | undefined): boolean =>
  !!uid && String(post.postedBy?._id ?? '') === uid;

/**
 * The college/global feeds carry only the last 5 replies, and the server's replyCount is never
 * decreased when a reply is deleted. Fewer than 5 replies = that is all of them; otherwise use the
 * larger of the two (may overcount after deletions until the server is fixed).
 */
export function replyCountOf(post: Pick<Post, 'replies' | 'replyCount'>): number {
  const loaded = (post.replies ?? []).length;
  return loaded < 5 ? loaded : Math.max(loaded, post.replyCount ?? 0);
}

/** Web Home.jsx `visible` filter: text, tags, or the name of a named author. */
export function matchesSearch(post: Post, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    post.text?.toLowerCase().includes(q) ||
    (post.tags ?? []).some((t) => t?.toLowerCase().includes(q)) ||
    (!post.isAnonymous && !!post.postedBy?.name?.toLowerCase().includes(q))
  );
}

/** Web link handling: add https:// when missing; anything else than http(s) is refused. */
export function normaliseLink(link: string): string | null {
  const url = /^https?:\/\//i.test(link) ? link : `https://${link}`;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

/** Web: "PDF · 123 KB". */
export const pdfSizeLabel = (bytes: number): string =>
  `PDF${bytes > 0 ? ` · ${(bytes / 1024).toFixed(0)} KB` : ''}`;

export const postUrl = (id: string): string => `https://themeetnet.com/post/${id}`;

/** Google's document viewer, as the web's "👁 View" button uses. */
export const pdfViewerUrl = (pdfUrl: string): string =>
  `https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`;
