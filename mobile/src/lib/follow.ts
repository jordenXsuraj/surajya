import type { ObjectId } from '@/types/api';
import type { SessionUser } from '@/types/user';

// Follow system (like a private Instagram account): "Follow" sends a request, the other person
// accepts or rejects it. Everything is derived from the signed-in user's own lists, because
// GET /users/:id says nothing about the relation. Pure functions, unit-tested.

/** How I relate to one other person. */
export type Relation = {
  /** I follow them. */
  iFollow: boolean;
  /** I asked to follow them; they have not answered yet. */
  iRequested: boolean;
  /** They asked to follow me; I have not answered yet. */
  theyRequested: boolean;
  /** They follow me. */
  theyFollow: boolean;
};

/**
 * What the follow button shows:
 * - `incoming`: Accept + Reject (they asked to follow me)
 * - `following`: "Following" (tap → confirm → unfollow)
 * - `requested`: "Requested", disabled (the API cannot withdraw a request)
 * - `followBack`: "Follow back" (they follow me, I don't follow them)
 * - `follow`: "Follow"
 */
export type FollowView = 'self' | 'incoming' | 'following' | 'requested' | 'followBack' | 'follow';

export type FollowEvent =
  | 'follow'
  | 'accept'
  | 'reject'
  | 'unfollow'
  | 'block'
  // The server refused because the state was already further along (stale screen):
  | 'alreadyFollowing'
  | 'alreadyRequested'
  | 'theyAlreadyRequested';

export const NO_RELATION: Relation = {
  iFollow: false,
  iRequested: false,
  theyRequested: false,
  theyFollow: false,
};

type RelationLists = Pick<
  SessionUser,
  '_id' | 'followingIds' | 'followerIds' | 'sentRequestIds' | 'incomingRequestIds'
>;

export function relationTo(me: RelationLists | null | undefined, id: ObjectId): Relation {
  if (!me) return NO_RELATION;
  return {
    iFollow: me.followingIds.includes(id),
    iRequested: me.sentRequestIds.includes(id),
    theyRequested: me.incomingRequestIds.includes(id),
    theyFollow: me.followerIds.includes(id),
  };
}

export function followView(relation: Relation, isSelf = false): FollowView {
  if (isSelf) return 'self';
  if (relation.theyRequested) return 'incoming';
  if (relation.iFollow) return 'following';
  if (relation.iRequested) return 'requested';
  if (relation.theyFollow) return 'followBack';
  return 'follow';
}

export const FOLLOW_LABELS: Record<Exclude<FollowView, 'self' | 'incoming'>, string> = {
  following: '✓ Following',
  requested: '⏳ Requested',
  followBack: 'Follow back',
  follow: '+ Follow',
};

/** The relation after an event (the optimistic update, or the state the server reported). */
export function applyFollowEvent(relation: Relation, event: FollowEvent): Relation {
  switch (event) {
    case 'follow':
      return relation.iFollow ? relation : { ...relation, iRequested: true };
    case 'accept':
      return { ...relation, theyRequested: false, theyFollow: true };
    case 'reject':
      return { ...relation, theyRequested: false };
    case 'unfollow':
      return { ...relation, iFollow: false };
    case 'block':
      return NO_RELATION;
    case 'alreadyFollowing':
      return { ...relation, iFollow: true, iRequested: false };
    case 'alreadyRequested':
      return { ...relation, iRequested: true };
    case 'theyAlreadyRequested':
      return { ...relation, theyRequested: true, iRequested: false };
  }
}

/**
 * POST /users/:id/connect answers 400 with these messages when the screen was out of date; the
 * app then shows the real state instead of an error.
 */
export function eventFromServerMessage(message: string | undefined): FollowEvent | null {
  switch (message) {
    case 'Already following':
      return 'alreadyFollowing';
    case 'Request already sent':
      return 'alreadyRequested';
    case 'User already requested you':
      return 'theyAlreadyRequested';
    default:
      return null;
  }
}

const withId = (ids: ObjectId[], id: ObjectId, on: boolean): ObjectId[] =>
  on ? (ids.includes(id) ? ids : [...ids, id]) : ids.filter((x) => x !== id);

/** The signed-in user's lists and counts after the relation with `id` changed. */
export function sessionWithRelation(
  me: SessionUser,
  id: ObjectId,
  next: Relation,
): Pick<
  SessionUser,
  | 'followingIds'
  | 'followerIds'
  | 'sentRequestIds'
  | 'incomingRequestIds'
  | 'followingCount'
  | 'followerCount'
> {
  const before = relationTo(me, id);
  return {
    followingIds: withId(me.followingIds, id, next.iFollow),
    followerIds: withId(me.followerIds, id, next.theyFollow),
    sentRequestIds: withId(me.sentRequestIds, id, next.iRequested),
    incomingRequestIds: withId(me.incomingRequestIds, id, next.theyRequested),
    followingCount: Math.max(0, me.followingCount + Number(next.iFollow) - Number(before.iFollow)),
    followerCount: Math.max(
      0,
      me.followerCount + Number(next.theyFollow) - Number(before.theyFollow),
    ),
  };
}

/** The other person's counts after the relation changed (I am in their followers when I follow). */
export function profileCountsWithRelation(
  counts: { followerCount: number; followingCount: number },
  before: Relation,
  next: Relation,
): { followerCount: number; followingCount: number } {
  return {
    followerCount: Math.max(
      0,
      counts.followerCount + Number(next.iFollow) - Number(before.iFollow),
    ),
    followingCount: Math.max(
      0,
      counts.followingCount + Number(next.theyFollow) - Number(before.theyFollow),
    ),
  };
}
