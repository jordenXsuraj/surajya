import { readJson, writeJson } from '@/lib/storage';
import { likeCountOf } from '@/lib/postView';
import type { Post, PostType } from '@/types/post';

// Client-side feed ranking ported from nexusnetwork/src/pages/Home.jsx (scorePost, affinityScore,
// trackInteraction). The web keeps behaviour in localStorage 'nx_bhv'; the app keeps it in the
// encrypted MMKV store (cleared on logout, like the rest of the cache).

export const BEHAVIOUR_KEY = 'ranking.behaviour';

export type Interaction = 'like' | 'reply' | 'save';
export type Behaviour = Partial<Record<PostType, Partial<Record<Interaction, number>>>>;

const HOUR = 3_600_000;

export function getBehaviour(): Behaviour {
  return readJson<Behaviour>(BEHAVIOUR_KEY) ?? {};
}

export function trackInteraction(postType: PostType | undefined, action: Interaction): void {
  if (!postType) return;
  try {
    const behaviour = getBehaviour();
    const counts = behaviour[postType] ?? { like: 0, reply: 0, save: 0 };
    counts[action] = (counts[action] ?? 0) + 1;
    behaviour[postType] = counts;
    writeJson(BEHAVIOUR_KEY, behaviour);
  } catch {
    // ranking is best-effort
  }
}

/** 0…2: how much this user engages with a post type (replies and saves count 3×). */
export function affinityScore(postType: PostType, behaviour: Behaviour = getBehaviour()): number {
  const b = behaviour[postType];
  if (!b) return 0;
  return Math.min(((b.reply ?? 0) * 3 + (b.save ?? 0) * 3 + (b.like ?? 0)) / 10, 2);
}

type ScoreContext = { connectionIds: readonly string[]; nowMs: number; behaviour: Behaviour };

export function scorePost(post: Post, { connectionIds, nowMs, behaviour }: ScoreContext): number {
  let score = 0;
  const ageHours = (nowMs - new Date(post.createdAt).getTime()) / HOUR;
  const likeCount = likeCountOf(post);
  const replies = post.replies ?? [];
  const replyCount = replies.length;
  const authorId = post.postedBy?._id ? String(post.postedBy._id) : undefined;
  const isConn = !!authorId && connectionIds.includes(authorId);

  score += 35 * Math.exp(-ageHours / 12);
  score += Math.min((ageHours > 0 ? likeCount / ageHours : likeCount) / 4, 1) * 20;
  const recentReplies = replies.filter(
    (r) => nowMs - new Date(r.createdAt).getTime() < 2 * HOUR,
  ).length;
  score += Math.min(replyCount * 1.2, 7) + Math.min(recentReplies * 2.5, 8);
  if (isConn) score += 15;
  score += affinityScore(post.type, behaviour) * 5;
  if ((post.imageUrl?.length ?? 0) > 0) score += 2;
  if ((post.link?.length ?? 0) > 0) score += 1;
  if ((post.tags?.length ?? 0) > 0) score += Math.min(post.tags.length, 2);
  if (ageHours > 72) score -= 18;
  if (ageHours > 168) score -= 25;
  if (ageHours > 6 && likeCount === 0 && replyCount === 0) score -= 8;

  return score;
}

/**
 * Highest score first. The web re-sorts the whole list after every page; the app sorts each page
 * as it arrives so posts already on screen never jump during infinite scroll.
 */
export function smartSort(
  posts: readonly Post[],
  connectionIds: readonly string[],
  nowMs: number = Date.now(),
  behaviour: Behaviour = getBehaviour(),
): Post[] {
  const ctx = { connectionIds, nowMs, behaviour };
  return posts
    .map((p) => ({ p, s: scorePost(p, ctx) }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}
