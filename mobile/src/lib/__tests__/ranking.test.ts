import {
  BEHAVIOUR_KEY,
  affinityScore,
  getBehaviour,
  scorePost,
  smartSort,
  trackInteraction,
  type Behaviour,
} from '@/lib/ranking';
import { getStorage } from '@/lib/storage';
import { resetAll } from '@/test/helpers';
import type { Post } from '@/types/post';

const NOW = Date.parse('2026-10-05T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function post(overrides: Partial<Post> = {}): Post {
  return {
    _id: Math.random().toString(16).slice(2),
    type: 'social',
    text: 'hello',
    tags: [],
    link: '',
    pdfName: '',
    pdfSize: 0,
    isAnonymous: false,
    college: 'PICT',
    createdAt: hoursAgo(1),
    postedBy: { _id: 'author', name: 'A' },
    likes: [],
    likeCount: 0,
    replies: [],
    ...overrides,
  };
}

const ctx = (behaviour: Behaviour = {}, connectionIds: string[] = []) => ({
  connectionIds,
  nowMs: NOW,
  behaviour,
});

beforeEach(() => resetAll());

describe('scorePost (web Home.jsx formula)', () => {
  it('a brand-new post with nothing else scores 35 (recency)', () => {
    expect(scorePost(post({ createdAt: hoursAgo(0) }), ctx())).toBeCloseTo(35, 5);
  });

  it('recency decays with a 12-hour time constant', () => {
    expect(scorePost(post({ createdAt: hoursAgo(12) }), ctx())).toBeCloseTo(
      35 * Math.exp(-1) - 8,
      5,
    );
  });

  it('like velocity is capped at +20', () => {
    const viral = post({ createdAt: hoursAgo(1), likeCount: 500 });
    expect(
      scorePost(viral, ctx()) - scorePost(post({ createdAt: hoursAgo(1) }), ctx()),
    ).toBeCloseTo(20, 5);
  });

  it('replies: 1.2 each (max 7) + 2.5 per reply in the last 2 h (max 8)', () => {
    const replies = Array.from({ length: 3 }, (_, i) => ({
      _id: `r${i}`,
      text: 'x',
      createdAt: hoursAgo(1),
      postedBy: null,
    }));
    const base = post({ createdAt: hoursAgo(1) });
    expect(scorePost({ ...base, replies }, ctx()) - scorePost(base, ctx())).toBeCloseTo(
      3 * 1.2 + 3 * 2.5,
      5,
    );
  });

  it('author I follow +15, image +2, link +1, tags up to +2', () => {
    const base = post({ createdAt: hoursAgo(1) });
    expect(scorePost(base, ctx({}, ['author'])) - scorePost(base, ctx())).toBeCloseTo(15, 5);
    expect(scorePost({ ...base, imageUrl: 'x' }, ctx()) - scorePost(base, ctx())).toBeCloseTo(2, 5);
    expect(scorePost({ ...base, link: 'x.dev' }, ctx()) - scorePost(base, ctx())).toBeCloseTo(1, 5);
    expect(
      scorePost({ ...base, tags: ['a', 'b', 'c'] }, ctx()) - scorePost(base, ctx()),
    ).toBeCloseTo(2, 5);
  });

  it('old posts are pushed down (-18 after 3 days, -25 more after a week) and quiet ones -8 after 6 h', () => {
    const fourDays = scorePost(post({ createdAt: hoursAgo(96), likeCount: 1 }), ctx());
    expect(fourDays).toBeCloseTo(35 * Math.exp(-8) + Math.min(1 / 96 / 4, 1) * 20 - 18, 5);
    const tenDays = scorePost(post({ createdAt: hoursAgo(240), likeCount: 1 }), ctx());
    expect(tenDays).toBeCloseTo(35 * Math.exp(-20) + Math.min(1 / 240 / 4, 1) * 20 - 18 - 25, 5);
    const quiet = scorePost(post({ createdAt: hoursAgo(7) }), ctx());
    expect(quiet).toBeCloseTo(35 * Math.exp(-7 / 12) - 8, 5);
  });

  it('anonymous posts (postedBy null) never count as a followed author', () => {
    const anon = post({ isAnonymous: true, postedBy: null });
    expect(() => scorePost(anon, ctx({}, ['author']))).not.toThrow();
    expect(scorePost(anon, ctx({}, ['author']))).toBeCloseTo(scorePost(anon, ctx()), 5);
  });
});

describe('behaviour (affinity) in MMKV', () => {
  it('trackInteraction counts per type and persists in the encrypted store', () => {
    trackInteraction('qa', 'reply');
    trackInteraction('qa', 'reply');
    trackInteraction('qa', 'like');
    expect(getBehaviour()).toEqual({ qa: { like: 1, reply: 2, save: 0 } });
    expect(JSON.parse(getStorage().getString(BEHAVIOUR_KEY) ?? '{}')).toEqual(getBehaviour());
  });

  it('affinity = (3·reply + 3·save + like) / 10, capped at 2, and adds 5× to the score', () => {
    expect(affinityScore('qa', { qa: { reply: 2, like: 1 } })).toBeCloseTo(0.7, 5);
    expect(affinityScore('qa', { qa: { reply: 50 } })).toBe(2);
    expect(affinityScore('social', {})).toBe(0);
    const base = post({ type: 'qa', createdAt: hoursAgo(1) });
    expect(scorePost(base, ctx({ qa: { reply: 50 } })) - scorePost(base, ctx())).toBeCloseTo(10, 5);
  });

  it('ignores a missing type', () => {
    trackInteraction(undefined, 'like');
    expect(getBehaviour()).toEqual({});
  });
});

describe('smartSort', () => {
  it('orders by score, highest first, without mutating the input', () => {
    const old = post({ _id: 'old', createdAt: hoursAgo(80) });
    const fresh = post({ _id: 'fresh', createdAt: hoursAgo(0.5) });
    const followed = post({
      _id: 'followed',
      createdAt: hoursAgo(3),
      postedBy: { _id: 'friend', name: 'F' },
    });
    const input = [old, fresh, followed];
    const sorted = smartSort(input, ['friend'], NOW, {});
    expect(sorted.map((p) => p._id)).toEqual(['followed', 'fresh', 'old']);
    expect(input.map((p) => p._id)).toEqual(['old', 'fresh', 'followed']);
  });
});
