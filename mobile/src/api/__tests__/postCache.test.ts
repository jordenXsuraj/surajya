import {
  forgetOwnPosts,
  PIN_OWN_POSTS_MS,
  pinRecentOwnPosts,
  rememberOwnPost,
} from '@/api/postCache';
import type { Post } from '@/types/post';

const NOW = Date.parse('2026-10-07T12:00:00Z');

function post(_id: string, overrides: Partial<Post> = {}): Post {
  return {
    _id,
    type: 'social',
    text: _id,
    tags: [],
    link: '',
    pdfName: '',
    pdfSize: 0,
    isAnonymous: false,
    college: 'PICT',
    createdAt: new Date(NOW).toISOString(),
    postedBy: { _id: 'someone', name: 'S' },
    likes: [],
    likeCount: 0,
    replies: [],
    ...overrides,
  };
}

const ids = (posts: Post[]) => posts.map((p) => p._id);

// A refetch re-ranks Home (people you follow first), which pushed a post the user had just
// created out of view a moment after "Posted!". These pin the rule that keeps it on top.
describe('pinRecentOwnPosts', () => {
  afterEach(() => forgetOwnPosts());

  it('puts the posts the user just created first, newest first, the rest in ranked order', () => {
    rememberOwnPost('mine-1', 'me', NOW - 60_000);
    rememberOwnPost('mine-2', 'me', NOW - 30_000);
    const ranked = [post('followed'), post('mine-1'), post('other'), post('mine-2')];
    expect(ids(pinRecentOwnPosts(ranked, 'me', NOW))).toEqual([
      'mine-2',
      'mine-1',
      'followed',
      'other',
    ]);
  });

  it('also keeps an anonymous post of the user on top (known by id only)', () => {
    rememberOwnPost('confession', 'me', NOW);
    const ranked = [post('followed'), post('confession', { isAnonymous: true, postedBy: null })];
    expect(ids(pinRecentOwnPosts(ranked, 'me', NOW))).toEqual(['confession', 'followed']);
  });

  it('stops pinning after 10 minutes', () => {
    rememberOwnPost('mine', 'me', NOW - PIN_OWN_POSTS_MS - 1);
    const ranked = [post('followed'), post('mine')];
    expect(ids(pinRecentOwnPosts(ranked, 'me', NOW))).toEqual(['followed', 'mine']);
  });

  it('only for the user who created them, and leaves pages without them untouched', () => {
    rememberOwnPost('mine', 'me', NOW);
    const ranked = [post('followed'), post('mine')];
    expect(ids(pinRecentOwnPosts(ranked, 'someone-else', NOW))).toEqual(['followed', 'mine']);
    expect(ids(pinRecentOwnPosts(ranked, undefined, NOW))).toEqual(['followed', 'mine']);
    const page = [post('a'), post('b')];
    expect(pinRecentOwnPosts(page, 'me', NOW)).toBe(page);
  });
});
