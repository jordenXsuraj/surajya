import { create } from 'zustand';

import type { Post } from '@/types/post';

/** What the report sheet is reporting: a post (⋯ menu) or a user (profile menu). */
export type ReportTarget = { kind: 'post' | 'user'; id: string };

// Overlays shared by every list (mounted once in the root layout): replies sheet, post menu,
// report sheet (posts and users), full-screen image, YouTube player. Also the posts and users
// reported in this session (by id; post and user ids never clash).
type PostUiState = {
  repliesPostId: string | null;
  /** Focus the reply input when the sheet opens (reply button / Interested). */
  repliesFocus: boolean;
  menuPost: Post | null;
  /** Profile ⋯ menu (Share profile, Report user, Block). */
  menuUser: { id: string; name: string } | null;
  report: ReportTarget | null;
  imageUrl: string | null;
  videoId: string | null;
  reported: Record<string, true>;
  /** Bumped to make the Home feed scroll to the top (e.g. after posting). */
  homeTopSignal: number;

  openReplies: (postId: string, focus?: boolean) => void;
  closeReplies: () => void;
  openMenu: (post: Post) => void;
  closeMenu: () => void;
  openUserMenu: (user: { id: string; name: string }) => void;
  closeUserMenu: () => void;
  openReport: (target: ReportTarget) => void;
  closeReport: () => void;
  markReported: (postId: string) => void;
  openImage: (url: string) => void;
  closeImage: () => void;
  openVideo: (id: string) => void;
  closeVideo: () => void;
  scrollHomeToTop: () => void;
  reset: () => void;
};

const initial = {
  repliesPostId: null,
  repliesFocus: false,
  menuPost: null,
  menuUser: null,
  report: null,
  imageUrl: null,
  videoId: null,
  reported: {},
  homeTopSignal: 0,
};

export const usePostUi = create<PostUiState>()((set) => ({
  ...initial,
  openReplies: (postId, focus = false) => set({ repliesPostId: postId, repliesFocus: focus }),
  closeReplies: () => set({ repliesPostId: null, repliesFocus: false }),
  openMenu: (post) => set({ menuPost: post }),
  closeMenu: () => set({ menuPost: null }),
  openUserMenu: (user) => set({ menuUser: user }),
  closeUserMenu: () => set({ menuUser: null }),
  openReport: (target) => set({ report: target }),
  closeReport: () => set({ report: null }),
  markReported: (postId) => set((s) => ({ reported: { ...s.reported, [postId]: true } })),
  openImage: (url) => set({ imageUrl: url }),
  closeImage: () => set({ imageUrl: null }),
  openVideo: (id) => set({ videoId: id }),
  closeVideo: () => set({ videoId: null }),
  scrollHomeToTop: () => set((s) => ({ homeTopSignal: s.homeTopSignal + 1 })),
  reset: () => set(initial),
}));
