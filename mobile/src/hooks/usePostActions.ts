import { router } from 'expo-router';
import { useMemo } from 'react';

import { useConnect, useInterested, useLike } from '@/hooks/usePostMutations';
import { openWebPage } from '@/lib/links';
import { isLikedBy, normaliseLink, pdfViewerUrl, visibleAuthor } from '@/lib/postView';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import type { Post } from '@/types/post';

/** Everything a PostCard can do. One stable object per list, so memoised cards don't re-render. */
export type PostActions = {
  like: (post: Post) => void;
  /** Double-tap: like only (never unlike). */
  likeOnce: (post: Post) => void;
  openReplies: (post: Post, focus?: boolean) => void;
  interested: (post: Post) => void;
  openMenu: (post: Post) => void;
  openImage: (url: string) => void;
  openVideo: (id: string) => void;
  openLink: (link: string) => void;
  openPdf: (pdfUrl: string) => void;
  openProfile: (userId: string) => void;
  openPost: (postId: string) => void;
  connect: (post: Post) => void;
};

type Overrides = {
  /** Post screen: replies are inline, so "reply" focuses the composer instead of opening the sheet. */
  openReplies?: PostActions['openReplies'];
};

export function usePostActions({ openReplies }: Overrides = {}): PostActions {
  const { mutate: like } = useLike();
  const { mutate: interested } = useInterested();
  const { mutate: connect } = useConnect();

  return useMemo<PostActions>(() => {
    const showReplies: PostActions['openReplies'] =
      openReplies ?? ((post, focus = false) => usePostUi.getState().openReplies(post._id, focus));
    return {
      like: (post) => like(post),
      likeOnce: (post) => {
        if (!isLikedBy(post, useAuthStore.getState().user?._id)) like(post);
      },
      openReplies: showReplies,
      // Web: after the interest reply, open the reply box so they can say more
      interested: (post) => interested(post, { onSuccess: () => showReplies(post, true) }),
      openMenu: (post) => usePostUi.getState().openMenu(post),
      openImage: (url) => usePostUi.getState().openImage(url),
      openVideo: (id) => usePostUi.getState().openVideo(id),
      openLink: (link) => {
        const url = normaliseLink(link);
        if (url) void openWebPage(url);
      },
      openPdf: (pdfUrl) => void openWebPage(pdfViewerUrl(pdfUrl)),
      openProfile: (userId) => {
        if (userId !== useAuthStore.getState().user?._id) router.push(`/profile/${userId}`);
      },
      openPost: (postId) => router.push(`/post/${postId}`),
      connect: (post) => {
        const author = visibleAuthor(post);
        if (author) connect({ id: String(author._id), name: author.name });
      },
    };
  }, [like, interested, connect, openReplies]);
}
