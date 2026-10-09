import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryKeys } from '@/api/queryKeys';
import { useBlockUser, useFollowActions } from '@/hooks/useFollow';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';
import type { Post } from '@/types/post';
import type { PersonRow, PublicUser } from '@/types/user';

const post = (id: string, author: string): Post => ({
  _id: id,
  type: 'social',
  text: `post ${id}`,
  tags: [],
  link: '',
  pdfName: '',
  pdfSize: 0,
  isAnonymous: false,
  college: 'PICT',
  createdAt: '2026-10-05T10:00:00.000Z',
  postedBy: { _id: author, name: author },
  likes: [],
  likeCount: 0,
  likedByMe: false,
  replies: [],
});

const profile = (id: string): PublicUser => ({
  _id: id,
  name: 'Riya Deshmukh',
  college: 'PICT',
  year: '3rd',
  branch: 'CS',
  skills: [],
  projects: [],
  followerCount: 10,
  followingCount: 4,
});

const page = (posts: Post[]): InfiniteData<Post[], number> => ({ pages: [posts], pageParams: [1] });

function setup() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity }, // no GC timers keeping Jest alive
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const me = () => useAuthStore.getState().user!;
const lastToast = () => useUiStore.getState().toast;

beforeEach(() => {
  resetAll();
  useAuthStore.getState().signIn(
    'tok',
    sessionUser({
      _id: 'me',
      followingIds: ['riya'],
      followerIds: ['nikhil'],
      sentRequestIds: [],
      incomingRequestIds: ['rohan'],
      followingCount: 1,
      followerCount: 1,
    }),
  );
});

describe('useFollowActions', () => {
  it('follow: "Requested" at once, request sent, toast', async () => {
    let release!: () => void;
    const calls = mockApi(
      () =>
        new Promise(
          (resolve) => (release = () => resolve({ status: 200, data: { message: 'ok' } })),
        ),
    );
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.follow({ id: 'ishaan', name: 'Ishaan Verma' }));
    await waitFor(() => expect(me().sentRequestIds).toEqual(['ishaan']));
    expect(calls[0]?.url).toBe('/users/ishaan/connect');
    await act(async () => release());
    await waitFor(() => expect(lastToast()?.message).toBe('✅ Request sent to Ishaan!'));
    expect(me().sentRequestIds).toEqual(['ishaan']);
  });

  it('follow refused by the server: back to "Follow" with the error', async () => {
    mockApi(() => ({ status: 403, data: { message: 'You cannot follow this user' } }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.follow({ id: 'x', name: 'X' }));
    await waitFor(() => expect(lastToast()?.message).toBe('❌ You cannot follow this user'));
    expect(me().sentRequestIds).toEqual([]);
  });

  it('a stale screen ("Already following") shows the real state instead of an error', async () => {
    mockApi(() => ({ status: 400, data: { message: 'Already following' } }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.follow({ id: 'tanvi', name: 'Tanvi Rao' }));
    await waitFor(() => expect(lastToast()?.message).toBe('You already follow Tanvi'));
    expect(lastToast()?.type).toBe('info');
    expect(me().followingIds).toContain('tanvi');
    expect(me().sentRequestIds).not.toContain('tanvi');
  });

  it('accept: they follow me, my follower count goes up, the request leaves the list', async () => {
    mockApi(() => ({ status: 200, data: { message: 'Request accepted' } }));
    const { qc, wrapper } = setup();
    const rows: PersonRow[] = [
      { _id: 'rohan', name: 'Rohan Kale' },
      { _id: 'kabir', name: 'Kabir Shah' },
    ];
    qc.setQueryData(queryKeys.requests, rows);
    qc.setQueryData(queryKeys.user('rohan'), profile('rohan'));
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.accept({ id: 'rohan', name: 'Rohan Kale' }));
    await waitFor(() => expect(me().incomingRequestIds).toEqual([]));
    expect(me().followerIds).toEqual(['nikhil', 'rohan']);
    expect(me().followerCount).toBe(2);
    expect(qc.getQueryData<PersonRow[]>(queryKeys.requests)?.map((r) => r._id)).toEqual(['kabir']);
    expect(qc.getQueryData<PublicUser>(queryKeys.user('rohan'))?.followingCount).toBe(5);
    await waitFor(() => expect(lastToast()?.message).toBe('✅ Rohan now follows you'));
  });

  it('reject failing puts the request back', async () => {
    mockApi(() => 'network');
    const { qc, wrapper } = setup();
    qc.setQueryData(queryKeys.requests, [{ _id: 'rohan', name: 'Rohan Kale' }]);
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.reject({ id: 'rohan', name: 'Rohan Kale' }));
    await waitFor(() => expect(lastToast()?.type).toBe('error'));
    expect(me().incomingRequestIds).toEqual(['rohan']);
    expect(qc.getQueryData<PersonRow[]>(queryKeys.requests)).toHaveLength(1);
  });

  it('unfollow: their posts leave the Following feed at once (and only that feed)', async () => {
    mockApi(() => ({ status: 200, data: { message: 'Unfollowed' } }));
    const { qc, wrapper } = setup();
    const following = queryKeys.feed('following', 'all');
    const home = queryKeys.feed('college', 'all');
    qc.setQueryData(following, page([post('p1', 'riya'), post('p2', 'meera')]));
    qc.setQueryData(home, page([post('p1', 'riya')]));
    qc.setQueryData(queryKeys.user('riya'), profile('riya'));
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.unfollow({ id: 'riya', name: 'Riya Deshmukh' }));
    await waitFor(() => expect(me().followingIds).toEqual([]));
    const ids = (key: readonly unknown[]) =>
      qc.getQueryData<InfiniteData<Post[], number>>(key)!.pages[0]!.map((p) => p._id);
    expect(ids(following)).toEqual(['p2']);
    expect(ids(home)).toEqual(['p1']);
    expect(qc.getQueryData<PublicUser>(queryKeys.user('riya'))?.followerCount).toBe(9);
    expect(me().followingCount).toBe(0);
    await waitFor(() => expect(lastToast()?.message).toBe('Unfollowed Riya'));
  });

  it('unfollow failing brings the posts back', async () => {
    mockApi(() => ({ status: 500, data: { message: 'Server error' } }));
    const { qc, wrapper } = setup();
    const following = queryKeys.feed('following', 'all');
    qc.setQueryData(following, page([post('p1', 'riya')]));
    const { result } = await renderHook(() => useFollowActions(), { wrapper });

    await act(async () => result.current.unfollow({ id: 'riya', name: 'Riya Deshmukh' }));
    await waitFor(() => expect(lastToast()?.type).toBe('error'));
    expect(me().followingIds).toEqual(['riya']);
    expect(qc.getQueryData<InfiniteData<Post[], number>>(following)!.pages[0]).toHaveLength(1);
  });
});

describe('useBlockUser', () => {
  it('removes their posts and rows everywhere and ends every relation', async () => {
    mockApi(() => ({ status: 200, data: { message: 'User blocked', blocked: true } }));
    const { qc, wrapper } = setup();
    qc.setQueryData(
      queryKeys.feed('college', 'all'),
      page([post('p1', 'nikhil'), post('p2', 'riya')]),
    );
    qc.setQueryData(queryKeys.myFollowers, [{ _id: 'nikhil', name: 'Nikhil Jain' }]);
    qc.setQueryData(queryKeys.userFollowers('riya'), [
      { _id: 'nikhil', name: 'Nikhil Jain' },
      { _id: 'me', name: 'Me' },
    ]);
    qc.setQueryData(queryKeys.user('nikhil'), profile('nikhil'));
    const { result } = await renderHook(() => useBlockUser(), { wrapper });

    await act(async () => result.current.mutate({ id: 'nikhil', name: 'Nikhil Jain' }));
    await waitFor(() => expect(me().blockedIds).toEqual(['nikhil']));
    expect(me().followerIds).toEqual([]);
    expect(me().followerCount).toBe(0);
    expect(
      qc
        .getQueryData<InfiniteData<Post[], number>>(queryKeys.feed('college', 'all'))!
        .pages[0]!.map((p) => p._id),
    ).toEqual(['p2']);
    expect(qc.getQueryData(queryKeys.myFollowers)).toEqual([]);
    expect(
      qc.getQueryData<PersonRow[]>(queryKeys.userFollowers('riya'))?.map((r) => r._id),
    ).toEqual(['me']);
    expect(qc.getQueryData(queryKeys.user('nikhil'))).toBeUndefined();
    expect(lastToast()?.message).toBe('🚫 Nikhil blocked');
  });
});
