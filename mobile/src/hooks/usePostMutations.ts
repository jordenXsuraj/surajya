import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  addReply,
  deletePost,
  deleteReply,
  likePost,
  reportPost,
  savePost,
  sendInterest,
} from '@/api/endpoints/posts';
import { blockUser, connectUser } from '@/api/endpoints/users';
import { ApiError, errorMessage } from '@/api/errors';
import {
  removePosts,
  restoreSnapshot,
  snapshotPosts,
  updatePost,
  type CacheSnapshot,
} from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import { applyLikeResponse, INTEREST_TEXT, toggleLike } from '@/lib/postView';
import { trackInteraction } from '@/lib/ranking';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { useUiStore } from '@/stores/ui.store';
import type { Post, Reply } from '@/types/post';
import type { ReportReason } from '@/types/report';
import type { Me } from '@/types/user';

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

/** The verify sheet already explains EMAIL_NOT_VERIFIED; don't add a toast on top of it. */
const isNotVerified = (e: unknown) => e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED';

const firstName = (name: string | undefined) => name?.split(' ')[0] || 'user';

// ── Likes ──────────────────────────────────────────────────────────────────────────────────
// PUT /like is a toggle, so requests for one post must reach the server in order: each like
// waits for the previous one on the same post. The heart flips immediately (optimistic); the
// server's answer is applied only when no other like on that post is still pending, so ten fast
// taps never flicker through intermediate states. A failed toggle is undone by flipping back.

const likeQueues = new Map<string, Promise<unknown>>();
const pendingLikes = new Map<string, number>();

function enqueue<T>(postId: string, task: () => Promise<T>): Promise<T> {
  const previous = likeQueues.get(postId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  likeQueues.set(postId, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (likeQueues.get(postId) === next) likeQueues.delete(postId);
    });
  return next;
}

export function useLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: Post) => enqueue(post._id, () => likePost(post._id)),
    onMutate: (post) => {
      const uid = useAuthStore.getState().user?._id ?? '';
      trackInteraction(post.type, 'like');
      pendingLikes.set(post._id, (pendingLikes.get(post._id) ?? 0) + 1);
      updatePost(qc, post._id, (p) => toggleLike(p, uid));
    },
    onSuccess: (data, post) => {
      if (pendingLikes.get(post._id) === 1)
        updatePost(qc, post._id, (p) => applyLikeResponse(p, data));
    },
    onError: (_error, post) => {
      const uid = useAuthStore.getState().user?._id ?? '';
      updatePost(qc, post._id, (p) => toggleLike(p, uid)); // undo this toggle only
      toast('❌ Failed. Try again', 'error');
    },
    onSettled: (_data, _error, post) => {
      const left = (pendingLikes.get(post._id) ?? 1) - 1;
      if (left > 0) pendingLikes.set(post._id, left);
      else pendingLikes.delete(post._id);
    },
  });
}

// ── Save ───────────────────────────────────────────────────────────────────────────────────
export function useSave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: Post) => savePost(post._id),
    onMutate: async (post) => {
      trackInteraction(post.type, 'save');
      await qc.cancelQueries({ queryKey: queryKeys.me });
      const previous = qc.getQueryData<Me>(queryKeys.me);
      const already = (previous?.savedPosts ?? []).map(String).includes(post._id);
      qc.setQueryData<Me>(queryKeys.me, (me) =>
        me
          ? {
              ...me,
              savedPosts: already
                ? (me.savedPosts ?? []).filter((id) => String(id) !== post._id)
                : [...(me.savedPosts ?? []), post._id],
            }
          : me,
      );
      return { previous, already };
    },
    onSuccess: (data, _post, context) => {
      const saved = data?.saved ?? !context?.already;
      toast(saved ? '🔖 Saved!' : 'Bookmark removed', 'success');
    },
    onError: (_error, _post, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.me, context.previous);
      toast('❌ Save failed', 'error');
    },
  });
}

// ── Delete post ────────────────────────────────────────────────────────────────────────────
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (post: Post) => deletePost(post._id),
    onMutate: async (post) => {
      await qc.cancelQueries({ queryKey: queryKeys.feeds });
      const snapshot = snapshotPosts(qc, post._id);
      removePosts(qc, (p) => p._id === post._id);
      return { snapshot };
    },
    onSuccess: () => toast('🗑️ Deleted', 'success'),
    onError: (error, _post, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast(`❌ ${errorMessage(error, 'Failed')}`, 'error');
    },
  });
}

// ── Replies ────────────────────────────────────────────────────────────────────────────────
let tempIds = 0;

type AddReplyVars = { post: Post; text: string };

export function useAddReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ post, text }: AddReplyVars) => addReply(post._id, text),
    onMutate: ({ post, text }) => {
      trackInteraction(post.type, 'reply');
      const me = useAuthStore.getState().user;
      const temp: Reply = {
        _id: `temp-${++tempIds}`,
        text,
        createdAt: new Date().toISOString(),
        postedBy: me
          ? { _id: me._id, name: me.name, year: me.year, branch: me.branch, avatar: me.avatar }
          : null,
        pending: true,
      };
      updatePost(qc, post._id, (p) => ({
        ...p,
        replies: [...(p.replies ?? []), temp],
        replyCount: (p.replyCount ?? (p.replies ?? []).length) + 1,
      }));
      return { tempId: temp._id };
    },
    onSuccess: (reply, { post }, context) => {
      updatePost(qc, post._id, (p) => ({
        ...p,
        replies: (p.replies ?? []).map((r) => (r._id === context?.tempId ? reply : r)),
      }));
    },
    onError: (error, { post }, context) => {
      updatePost(qc, post._id, (p) => ({
        ...p,
        replies: (p.replies ?? []).filter((r) => r._id !== context?.tempId),
        replyCount: Math.max(0, (p.replyCount ?? 1) - 1),
      }));
      if (!isNotVerified(error)) toast(errorMessage(error, 'Failed'), 'error');
    },
  });
}

type DeleteReplyVars = { postId: string; reply: Reply };

export function useDeleteReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, reply }: DeleteReplyVars) => deleteReply(postId, reply._id),
    onMutate: ({ postId, reply }) => {
      const snapshot: CacheSnapshot = snapshotPosts(qc, postId);
      updatePost(qc, postId, (p) => ({
        ...p,
        replies: (p.replies ?? []).filter((r) => r._id !== reply._id),
      }));
      return { snapshot };
    },
    onError: (_error, _vars, context) => {
      if (context) restoreSnapshot(qc, context.snapshot);
      toast('Could not delete', 'error');
    },
  });
}

/**
 * Project posts: like the web, post the reply "🙋 I'm interested in collaborating!", then tell the
 * author (POST /interested, fire-and-forget). The caller then opens the replies so they can add more.
 */
export function useInterested() {
  const addReplyMutation = useAddReply();
  return useMutation({
    mutationFn: async (post: Post) => {
      await addReplyMutation.mutateAsync({ post, text: INTEREST_TEXT });
      sendInterest(post._id).catch(() => undefined);
    },
  });
}

// ── Report ─────────────────────────────────────────────────────────────────────────────────
type ReportVars = { postId: string; reason: ReportReason; note?: string };

export function useReportPost() {
  return useMutation({
    mutationFn: ({ postId, reason, note }: ReportVars) => reportPost(postId, reason, note),
    onSuccess: (data, { postId }) => {
      usePostUi.getState().markReported(postId);
      toast(data?.message || 'Report submitted. Thank you.', 'success');
    },
    onError: (error, { postId }) => {
      // 400 = already reported (web treats it as reported too)
      if (error instanceof ApiError && error.status === 400) {
        usePostUi.getState().markReported(postId);
        toast(error.message, 'info');
      } else if (!isNotVerified(error)) {
        toast(errorMessage(error, 'Could not send the report'), 'error');
      }
    },
  });
}

// ── People ─────────────────────────────────────────────────────────────────────────────────
type PersonVars = { id: string; name?: string };

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: PersonVars) => blockUser(id),
    onSuccess: (_data, { id, name }) => {
      removePosts(qc, (p) => !p.isAnonymous && String(p.postedBy?._id ?? '') === id);
      const user = useAuthStore.getState().user;
      if (user) {
        useAuthStore.getState().updateUser({
          followingIds: user.followingIds.filter((x) => x !== id),
          sentRequestIds: user.sentRequestIds.filter((x) => x !== id),
        });
      }
      toast(`🚫 ${firstName(name)} blocked`, 'success');
    },
    onError: (error) => toast(`❌ ${errorMessage(error, 'Failed')}`, 'error'),
  });
}

/** Follow request; the card shows "⏳" right away and goes back to "Connect" if it fails. */
export function useConnect() {
  return useMutation({
    mutationFn: ({ id }: PersonVars) => connectUser(id),
    onMutate: ({ id }) => {
      const user = useAuthStore.getState().user;
      if (user && !user.sentRequestIds.includes(id)) {
        useAuthStore.getState().updateUser({ sentRequestIds: [...user.sentRequestIds, id] });
      }
    },
    onSuccess: (_data, { name }) => toast(`✅ Request sent to ${firstName(name)}!`, 'success'),
    onError: (error, { id }) => {
      const user = useAuthStore.getState().user;
      if (user) {
        useAuthStore
          .getState()
          .updateUser({ sentRequestIds: user.sentRequestIds.filter((x) => x !== id) });
      }
      if (!isNotVerified(error)) toast(`❌ ${errorMessage(error, 'Failed')}`, 'error');
    },
  });
}
