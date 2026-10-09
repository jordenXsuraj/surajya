import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import {
  findPost,
  isPostListKey,
  removePosts,
  snapshotPosts,
  restoreSnapshot,
  updateAuthor,
  updatePost,
} from '@/api/postCache';
import { queryKeys } from '@/api/queryKeys';
import type { Post } from '@/types/post';

const post = (id: string, author: string | null, replyAuthor?: string): Post => ({
  _id: id,
  type: 'social',
  text: id,
  tags: [],
  link: '',
  pdfName: '',
  pdfSize: 0,
  isAnonymous: author === null,
  college: 'PICT',
  createdAt: '2026-10-05T10:00:00.000Z',
  postedBy: author ? { _id: author, name: `Name ${author}`, avatar: '' } : null,
  likes: [],
  likeCount: 0,
  likedByMe: false,
  replies: replyAuthor
    ? [
        {
          _id: `r-${id}`,
          text: 'hi',
          createdAt: '2026-10-05T10:00:00.000Z',
          postedBy: { _id: replyAuthor, name: `Name ${replyAuthor}` },
        },
      ]
    : [],
});

const page = (posts: Post[]): InfiniteData<Post[], number> => ({ pages: [posts], pageParams: [1] });

function seeded() {
  const qc = new QueryClient();
  qc.setQueryData(queryKeys.feed('college', 'all'), page([post('a', 'u1'), post('b', 'me')]));
  qc.setQueryData(queryKeys.myPosts, page([post('b', 'me'), post('anon', null)]));
  qc.setQueryData(queryKeys.mySaved, [post('a', 'u1')]);
  qc.setQueryData(queryKeys.userPosts('u1'), [post('a', 'u1'), post('c', 'u1', 'me')]);
  qc.setQueryData(queryKeys.post('c'), post('c', 'u1', 'me'));
  return qc;
}

const idsOf = (qc: QueryClient, key: readonly unknown[]) => {
  const data = qc.getQueryData<InfiniteData<Post[], number> | Post[]>(key);
  return (Array.isArray(data) ? data : (data?.pages.flat() ?? [])).map((p) => p._id);
};

describe('post lists in the cache', () => {
  it('knows which keys hold posts', () => {
    expect(isPostListKey(queryKeys.feed('following', 'all'))).toBe(true);
    expect(isPostListKey(queryKeys.myPosts)).toBe(true);
    expect(isPostListKey(queryKeys.mySaved)).toBe(true);
    expect(isPostListKey(queryKeys.userPosts('x'))).toBe(true);
    expect(isPostListKey(queryKeys.me)).toBe(false);
    expect(isPostListKey(queryKeys.user('x'))).toBe(false);
    expect(isPostListKey(queryKeys.myFollowers)).toBe(false);
  });

  it('updatePost changes the post in feeds, my posts, saved and profiles alike', () => {
    const qc = seeded();
    updatePost(qc, 'a', (p) => ({ ...p, likeCount: 7 }));
    const likes = (key: readonly unknown[]) => {
      const data = qc.getQueryData<InfiniteData<Post[], number> | Post[]>(key);
      const list = Array.isArray(data) ? data : data!.pages.flat();
      return list.find((p) => p._id === 'a')?.likeCount;
    };
    expect(likes(queryKeys.feed('college', 'all'))).toBe(7);
    expect(likes(queryKeys.mySaved)).toBe(7);
    expect(likes(queryKeys.userPosts('u1'))).toBe(7);
  });

  it('removePosts takes a post out of every list, or only out of one scope', () => {
    const qc = seeded();
    removePosts(qc, (p) => p._id === 'b', queryKeys.myPosts);
    expect(idsOf(qc, queryKeys.myPosts)).toEqual(['anon']);
    expect(idsOf(qc, queryKeys.feed('college', 'all'))).toEqual(['a', 'b']);

    removePosts(qc, (p) => p.postedBy?._id === 'u1');
    expect(idsOf(qc, queryKeys.feed('college', 'all'))).toEqual(['b']);
    expect(idsOf(qc, queryKeys.mySaved)).toEqual([]);
    expect(idsOf(qc, queryKeys.userPosts('u1'))).toEqual([]);
    expect(qc.getQueryData(queryKeys.post('c'))).toBeUndefined();
  });

  it('findPost and snapshots see the new lists too', () => {
    const qc = seeded();
    expect(findPost(qc, 'anon')?._id).toBe('anon');
    const snapshot = snapshotPosts(qc);
    removePosts(qc, () => true);
    restoreSnapshot(qc, snapshot);
    expect(idsOf(qc, queryKeys.userPosts('u1'))).toEqual(['a', 'c']);
  });

  it('updateAuthor gives my posts and replies my new photo everywhere, not anonymous ones', () => {
    const qc = seeded();
    updateAuthor(qc, 'me', { avatar: 'http://localhost:5000/uploads/images/new.jpg' });
    const feed = qc.getQueryData<InfiniteData<Post[], number>>(queryKeys.feed('college', 'all'))!;
    expect(feed.pages[0]![1]!.postedBy?.avatar).toContain('new.jpg');
    expect(feed.pages[0]![0]!.postedBy?.avatar).toBe(''); // someone else's
    const mine = qc.getQueryData<InfiniteData<Post[], number>>(queryKeys.myPosts)!.pages[0]!;
    expect(mine[1]!.postedBy).toBeNull(); // anonymous stays anonymous
    expect(qc.getQueryData<Post>(queryKeys.post('c'))!.replies[0]!.postedBy?.avatar).toContain(
      'new.jpg',
    );
  });
});
