import { create } from 'zustand';

import type { Post } from '@/types/post';

// Overlays shared by every list (mounted once in the root layout): replies sheet, post menu,
// report sheet, full-screen image, YouTube player. Also the posts reported in this session.
type PostUiState = {
  repliesPostId: string | null;
  /** Focus the reply input when the sheet opens (reply button / Interested). */
  repliesFocus: boolean;
  menuPost: Post | null;
  reportPostId: string | null;
  imageUrl: string | null;
  videoId: string | null;
  reported: Record<string, true>;

  openReplies: (postId: string, focus?: boolean) => void;
  closeReplies: () => void;
  openMenu: (post: Post) => void;
  closeMenu: () => void;
  openReport: (postId: string) => void;
  closeReport: () => void;
  markReported: (postId: string) => void;
  openImage: (url: string) => void;
  closeImage: () => void;
  openVideo: (id: string) => void;
  closeVideo: () => void;
  reset: () => void;
};

const initial = {
  repliesPostId: null,
  repliesFocus: false,
  menuPost: null,
  reportPostId: null,
  imageUrl: null,
  videoId: null,
  reported: {},
};

export const usePostUi = create<PostUiState>()((set) => ({
  ...initial,
  openReplies: (postId, focus = false) => set({ repliesPostId: postId, repliesFocus: focus }),
  closeReplies: () => set({ repliesPostId: null, repliesFocus: false }),
  openMenu: (post) => set({ menuPost: post }),
  closeMenu: () => set({ menuPost: null }),
  openReport: (postId) => set({ reportPostId: postId }),
  closeReport: () => set({ reportPostId: null }),
  markReported: (postId) => set((s) => ({ reported: { ...s.reported, [postId]: true } })),
  openImage: (url) => set({ imageUrl: url }),
  closeImage: () => set({ imageUrl: null }),
  openVideo: (id) => set({ videoId: id }),
  closeVideo: () => set({ videoId: null }),
  reset: () => set(initial),
}));
