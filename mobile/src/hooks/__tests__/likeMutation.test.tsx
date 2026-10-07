import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryKeys } from '@/api/queryKeys';
import { useLike } from '@/hooks/usePostMutations';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';
import type { Post } from '@/types/post';

const post: Post = {
  _id: 'p1',
  type: 'social',
  text: 'hello',
  tags: [],
  link: '',
  pdfName: '',
  pdfSize: 0,
  isAnonymous: false,
  college: 'PICT',
  createdAt: '2026-10-05T10:00:00.000Z',
  postedBy: { _id: 'a1', name: 'Author' },
  likes: ['x'],
  likeCount: 1,
  likedByMe: false,
  replies: [],
};

const FEED = queryKeys.feed('global', 'all');
const FOLLOWING = queryKeys.feed('following', 'all');

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const page = (p: Post): InfiniteData<Post[], number> => ({ pages: [[p]], pageParams: [1] });
  qc.setQueryData(FEED, page(post));
  qc.setQueryData(FOLLOWING, page(post));
  qc.setQueryData(queryKeys.post('p1'), post);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const read = () => ({
    feed: qc.getQueryData<InfiniteData<Post[], number>>(FEED)!.pages[0]![0]!,
    following: qc.getQueryData<InfiniteData<Post[], number>>(FOLLOWING)!.pages[0]![0]!,
    single: qc.getQueryData<Post>(queryKeys.post('p1'))!,
  });
  return { qc, wrapper, read };
}

beforeEach(() => {
  resetAll();
  useAuthStore.getState().signIn('tok', sessionUser({ _id: 'me' }));
});

describe('optimistic like', () => {
  it('updates every cached copy at once, then keeps the server state', async () => {
    const { wrapper, read } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi(async () => {
      await gate; // hold the server answer back
      return { status: 200, data: { liked: true, count: 2, likeCount: 2, likes: ['x', 'me'] } };
    });
    const { result } = await renderHook(() => useLike(), { wrapper });

    await act(async () => result.current.mutate(post));
    // optimistic: before the server answers
    expect(read().feed).toMatchObject({ likedByMe: true, likeCount: 2 });
    expect(read().following).toMatchObject({ likedByMe: true, likeCount: 2 });
    expect(read().single).toMatchObject({ likedByMe: true, likeCount: 2 });
    release();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(read().feed).toMatchObject({ likedByMe: true, likeCount: 2, likes: ['x', 'me'] });
  });

  it('rolls back every copy when the request fails, and says so', async () => {
    const { wrapper, read } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mockApi(async () => {
      await gate;
      return { status: 500, data: { message: 'boom' } };
    });
    const { result } = await renderHook(() => useLike(), { wrapper });

    await act(async () => result.current.mutate(post));
    expect(read().feed.likedByMe).toBe(true); // optimistic
    release();

    await waitFor(() => expect(result.current.isError).toBe(true));
    for (const copy of Object.values(read())) {
      expect(copy).toMatchObject({ likedByMe: false, likeCount: 1 });
    }
    expect(useUiStore.getState().toast?.message).toBe('❌ Failed. Try again');
  });

  it('fast taps go to the server one at a time, in order, and only the last answer is applied', async () => {
    const { wrapper, read } = setup();
    const order: string[] = [];
    let serverLiked = false;
    mockApi((config) => {
      order.push(String(config.url));
      serverLiked = !serverLiked;
      return {
        status: 200,
        data: { liked: serverLiked, likeCount: serverLiked ? 2 : 1, likes: [] },
      };
    });
    const { result } = await renderHook(() => useLike(), { wrapper });

    await act(async () => {
      result.current.mutate(post); // like
      result.current.mutate(post); // unlike
      result.current.mutate(post); // like
    });
    expect(read().feed).toMatchObject({ likedByMe: true, likeCount: 2 }); // three flips

    await waitFor(() => expect(order).toHaveLength(3));
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(order).toEqual(['/posts/p1/like', '/posts/p1/like', '/posts/p1/like']);
    expect(read().feed).toMatchObject({ likedByMe: true, likeCount: 2 });
  });
});
