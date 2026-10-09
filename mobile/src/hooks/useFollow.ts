import { useMutation, useQueryClient, type Query, type QueryClient } from '@tanstack/react-query';

import {
  acceptRequest,
  blockUser,
  connectUser,
  rejectRequest,
  reportUser,
  unblockUser,
  unfollowUser,
} from '@/api/endpoints/users';
import { ApiError, errorMessage } from '@/api/errors';
import { removePosts, restoreSnapshot, type CacheSnapshot } from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import {
  applyFollowEvent,
  eventFromServerMessage,
  NO_RELATION,
  profileCountsWithRelation,
  relationTo,
  sessionWithRelation,
  type FollowEvent,
  type Relation,
} from '@/lib/follow';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { useUiStore } from '@/stores/ui.store';
import type { Post } from '@/types/post';
import type { ReportReason } from '@/types/report';
import type { PersonRow, PublicUser } from '@/types/user';

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

/** The verify sheet already explains EMAIL_NOT_VERIFIED; don't add a toast on top of it. */
const isNotVerified = (e: unknown) => e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED';

const firstName = (name: string | undefined) => name?.split(' ')[0] || 'user';

export type Person = { id: string; name?: string };

const byAuthor = (id: string) => (p: Post) =>
  !p.isAnonymous && String(p.postedBy?._id ?? '') === id;

/** Sets my relation with `id` in the session (lists + counts) and in their cached profile. */
function setRelation(qc: QueryClient, id: string, next: Relation): void {
  const me = useAuthStore.getState().user;
  if (!me) return;
  const before = relationTo(me, id);
  useAuthStore.getState().updateUser(sessionWithRelation(me, id, next));
  qc.setQueryData<PublicUser>(queryKeys.user(id), (profile) =>
    profile ? { ...profile, ...profileCountsWithRelation(profile, before, next) } : profile,
  );
}

/** Everything that shows who follows whom, for me and for them. */
function invalidateRelations(qc: QueryClient, id: string): void {
  void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
  for (const key of [queryKeys.myFollowers, queryKeys.myFollowing, queryKeys.requests]) {
    void qc.invalidateQueries({ queryKey: key, exact: true });
  }
  void qc.invalidateQueries({ queryKey: queryKeys.userAll(id) });
  void qc.invalidateQueries({ queryKey: queryKeys.suggestions });
}

type FollowAction = 'follow' | 'accept' | 'reject' | 'unfollow';

const CALLS: Record<FollowAction, (id: string) => Promise<unknown>> = {
  follow: connectUser,
  accept: acceptRequest,
  reject: rejectRequest,
  unfollow: unfollowUser,
};

const DONE: Record<FollowAction, (first: string) => string> = {
  follow: (first) => `✅ Request sent to ${first}!`,
  accept: (first) => `✅ ${first} now follows you`,
  reject: () => 'Request removed',
  unfollow: (first) => `Unfollowed ${first}`,
};

const SETTLED: Partial<Record<FollowEvent, (first: string) => string>> = {
  alreadyFollowing: (first) => `You already follow ${first}`,
  alreadyRequested: () => 'Request already sent',
  theyAlreadyRequested: (first) => `${first} already asked to follow you`,
};

type FollowContext = {
  before: Relation;
  feed: CacheSnapshot | null;
  requests: PersonRow[] | undefined;
};

/**
 * One follow-system action, optimistic: the button, counts and lists change at once and go back
 * if the server refuses. When the server says the screen was out of date ("Already following"…),
 * the real state is shown instead of an error. Unfollow also takes their posts out of the
 * Following feed right away.
 */
function useFollowMutation(action: FollowAction) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, Person, FollowContext | undefined>({
    mutationFn: ({ id }) => CALLS[action](id),
    onMutate: async ({ id }) => {
      const me = useAuthStore.getState().user;
      if (!me) return undefined;
      await qc.cancelQueries({ queryKey: queryKeys.user(id) });
      const before = relationTo(me, id);
      setRelation(qc, id, applyFollowEvent(before, action));
      let feed: CacheSnapshot | null = null;
      if (action === 'unfollow') {
        feed = qc.getQueriesData({ queryKey: queryKeys.followingFeed });
        removePosts(qc, byAuthor(id), queryKeys.followingFeed);
      }
      // Answered requests leave the requests list at once
      let requests: PersonRow[] | undefined;
      if (action === 'accept' || action === 'reject') {
        await qc.cancelQueries({ queryKey: queryKeys.requests, exact: true });
        requests = qc.getQueryData<PersonRow[]>(queryKeys.requests);
        qc.setQueryData<PersonRow[]>(queryKeys.requests, (rows) =>
          rows?.filter((r) => String(r._id) !== id),
        );
      }
      return { before, feed, requests };
    },
    onSuccess: (_data, { name }) => toast(DONE[action](firstName(name)), 'success'),
    onError: (error, { id, name }, context) => {
      if (context) {
        setRelation(qc, id, context.before);
        if (context.feed) restoreSnapshot(qc, context.feed);
        if (context.requests) qc.setQueryData(queryKeys.requests, context.requests);
      }
      const settled =
        error instanceof ApiError && error.status === 400
          ? eventFromServerMessage(error.message)
          : null;
      const settledText = settled && SETTLED[settled];
      if (settled && settledText && context) {
        setRelation(qc, id, applyFollowEvent(context.before, settled));
        toast(settledText(firstName(name)), 'info');
      } else if (!isNotVerified(error)) {
        toast(`❌ ${errorMessage(error, 'Failed')}`, 'error');
      }
    },
    onSettled: (_data, _error, { id }) => {
      invalidateRelations(qc, id);
      if (action === 'unfollow') void qc.invalidateQueries({ queryKey: queryKeys.followingFeed });
    },
  });
}

/** Follow (request), Accept, Reject, Unfollow — shared by profiles, people lists and post cards. */
export function useFollowActions() {
  const follow = useFollowMutation('follow');
  const accept = useFollowMutation('accept');
  const reject = useFollowMutation('reject');
  const unfollow = useFollowMutation('unfollow');
  return {
    follow: follow.mutate,
    accept: accept.mutate,
    reject: reject.mutate,
    unfollow: unfollow.mutate,
    pending: follow.isPending || accept.isPending || reject.isPending || unfollow.isPending,
  };
}

const isPeopleList = (query: Query) => {
  const [a, b, c] = query.queryKey;
  return (
    (a === 'me' && (b === 'followers' || b === 'following' || b === 'requests')) ||
    (a === 'user' && (c === 'followers' || c === 'following'))
  );
};

/**
 * Block: their named posts leave every list, they leave every people list, follows and requests
 * end both ways (as on the server), and their profile is no longer cached.
 */
export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: Person) => blockUser(id),
    onSuccess: (_data, { id, name }) => {
      removePosts(qc, byAuthor(id));
      qc.setQueriesData<PersonRow[]>({ predicate: isPeopleList }, (rows) =>
        rows?.some((r) => String(r._id) === id) ? rows.filter((r) => String(r._id) !== id) : rows,
      );
      const me = useAuthStore.getState().user;
      if (me) {
        useAuthStore.getState().updateUser({
          ...sessionWithRelation(me, id, NO_RELATION),
          blockedIds: me.blockedIds.includes(id) ? me.blockedIds : [...me.blockedIds, id],
        });
      }
      qc.removeQueries({ queryKey: queryKeys.userAll(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.blocked, exact: true });
      toast(`🚫 ${firstName(name)} blocked`, 'success');
    },
    onError: (error) => toast(`❌ ${errorMessage(error, 'Failed')}`, 'error'),
  });
}

/** Unblock from Settings → Blocked users: the row goes at once; their posts come back on refetch. */
export function useUnblockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: Person) => unblockUser(id),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: queryKeys.blocked, exact: true });
      const previous = qc.getQueryData<PersonRow[]>(queryKeys.blocked);
      qc.setQueryData<PersonRow[]>(queryKeys.blocked, (rows) =>
        rows?.filter((r) => String(r._id) !== id),
      );
      return { previous };
    },
    onSuccess: (_data, { id, name }) => {
      const me = useAuthStore.getState().user;
      if (me)
        useAuthStore.getState().updateUser({ blockedIds: me.blockedIds.filter((x) => x !== id) });
      void qc.invalidateQueries({ queryKey: queryKeys.feeds });
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      toast(`${firstName(name)} unblocked`, 'success');
    },
    onError: (error, _person, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.blocked, context.previous);
      toast(`❌ ${errorMessage(error, 'Failed')}`, 'error');
    },
  });
}

type ReportUserVars = { id: string; reason: ReportReason; note?: string };

/** Same answers as reporting a post: 400 = already reported (shown as info). */
export function useReportUser() {
  return useMutation({
    mutationFn: ({ id, reason, note }: ReportUserVars) => reportUser(id, reason, note),
    onSuccess: (data, { id }) => {
      usePostUi.getState().markReported(id);
      toast(data?.message || 'Report submitted. Thank you.', 'success');
    },
    onError: (error, { id }) => {
      if (error instanceof ApiError && error.status === 400) {
        usePostUi.getState().markReported(id);
        toast(error.message, 'info');
      } else if (!isNotVerified(error)) {
        toast(errorMessage(error, 'Could not send the report'), 'error');
      }
    },
  });
}
