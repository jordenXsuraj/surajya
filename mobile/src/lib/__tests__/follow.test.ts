import {
  applyFollowEvent,
  eventFromServerMessage,
  followView,
  NO_RELATION,
  profileCountsWithRelation,
  relationTo,
  sessionWithRelation,
  type FollowEvent,
  type Relation,
} from '@/lib/follow';
import { sessionUser } from '@/test/helpers';

const rel = (patch: Partial<Relation> = {}): Relation => ({ ...NO_RELATION, ...patch });

describe('relationTo', () => {
  it('reads all four flags from my own lists', () => {
    const me = sessionUser({
      followingIds: ['a'],
      followerIds: ['a', 'b'],
      sentRequestIds: ['c'],
      incomingRequestIds: ['d'],
    });
    expect(relationTo(me, 'a')).toEqual(rel({ iFollow: true, theyFollow: true }));
    expect(relationTo(me, 'b')).toEqual(rel({ theyFollow: true }));
    expect(relationTo(me, 'c')).toEqual(rel({ iRequested: true }));
    expect(relationTo(me, 'd')).toEqual(rel({ theyRequested: true }));
    expect(relationTo(me, 'x')).toEqual(NO_RELATION);
    expect(relationTo(null, 'a')).toEqual(NO_RELATION);
  });
});

describe('followView', () => {
  it('maps every combination of flags to one button', () => {
    const flags = ['iFollow', 'iRequested', 'theyRequested', 'theyFollow'] as const;
    for (let mask = 0; mask < 16; mask++) {
      const r = rel(Object.fromEntries(flags.map((f, i) => [f, Boolean(mask & (1 << i))])));
      const expected = r.theyRequested
        ? 'incoming'
        : r.iFollow
          ? 'following'
          : r.iRequested
            ? 'requested'
            : r.theyFollow
              ? 'followBack'
              : 'follow';
      expect(followView(r)).toBe(expected);
    }
  });

  it('shows nothing for myself', () => {
    expect(followView(rel({ iFollow: true }), true)).toBe('self');
  });
});

describe('applyFollowEvent', () => {
  const cases: [string, Relation, FollowEvent, Relation][] = [
    ['follow → requested', rel(), 'follow', rel({ iRequested: true })],
    [
      'follow back keeps theyFollow',
      rel({ theyFollow: true }),
      'follow',
      rel({ theyFollow: true, iRequested: true }),
    ],
    [
      'follow when already following changes nothing',
      rel({ iFollow: true }),
      'follow',
      rel({ iFollow: true }),
    ],
    ['accept → they follow me', rel({ theyRequested: true }), 'accept', rel({ theyFollow: true })],
    ['reject → request gone', rel({ theyRequested: true }), 'reject', rel()],
    [
      'reject keeps my own follow',
      rel({ theyRequested: true, iFollow: true }),
      'reject',
      rel({ iFollow: true }),
    ],
    ['unfollow', rel({ iFollow: true, theyFollow: true }), 'unfollow', rel({ theyFollow: true })],
    [
      'block ends everything',
      rel({ iFollow: true, theyFollow: true, iRequested: true, theyRequested: true }),
      'block',
      rel(),
    ],
    [
      'server: already following',
      rel({ iRequested: true }),
      'alreadyFollowing',
      rel({ iFollow: true }),
    ],
    ['server: request already sent', rel(), 'alreadyRequested', rel({ iRequested: true })],
    [
      'server: they already asked me',
      rel({ iRequested: true }),
      'theyAlreadyRequested',
      rel({ theyRequested: true }),
    ],
  ];
  it.each(cases)('%s', (_name, before, event, after) => {
    expect(applyFollowEvent(before, event)).toEqual(after);
  });

  it('accepting, then following back, then unfollowing walks the button through every state', () => {
    let r = rel({ theyRequested: true });
    expect(followView(r)).toBe('incoming');
    r = applyFollowEvent(r, 'accept');
    expect(followView(r)).toBe('followBack');
    r = applyFollowEvent(r, 'follow');
    expect(followView(r)).toBe('requested');
    r = applyFollowEvent(r, 'alreadyFollowing');
    expect(followView(r)).toBe('following');
    r = applyFollowEvent(r, 'unfollow');
    expect(followView(r)).toBe('followBack');
  });
});

describe('eventFromServerMessage', () => {
  it('knows the three "out of date" answers of POST /users/:id/connect', () => {
    expect(eventFromServerMessage('Already following')).toBe('alreadyFollowing');
    expect(eventFromServerMessage('Request already sent')).toBe('alreadyRequested');
    expect(eventFromServerMessage('User already requested you')).toBe('theyAlreadyRequested');
    expect(eventFromServerMessage('You cannot follow this user')).toBeNull();
    expect(eventFromServerMessage(undefined)).toBeNull();
  });
});

describe('sessionWithRelation / profileCountsWithRelation', () => {
  it('moves the id between my lists and keeps my counts in step', () => {
    const me = sessionUser({
      followingIds: ['a'],
      followerIds: [],
      incomingRequestIds: ['a'],
      followingCount: 1,
      followerCount: 0,
    });
    const next = applyFollowEvent(relationTo(me, 'a'), 'accept');
    expect(sessionWithRelation(me, 'a', next)).toEqual({
      followingIds: ['a'],
      followerIds: ['a'],
      sentRequestIds: [],
      incomingRequestIds: [],
      followingCount: 1,
      followerCount: 1,
    });
    const unfollowed = applyFollowEvent(next, 'unfollow');
    expect(sessionWithRelation(me, 'a', unfollowed).followingCount).toBe(0);
  });

  it('never goes below zero', () => {
    const me = sessionUser({ followingIds: ['a'], followingCount: 0 });
    expect(sessionWithRelation(me, 'a', NO_RELATION).followingCount).toBe(0);
  });

  it('updates their follower count when I start or stop following them', () => {
    const counts = { followerCount: 10, followingCount: 3 };
    expect(profileCountsWithRelation(counts, rel(), rel({ iFollow: true }))).toEqual({
      followerCount: 11,
      followingCount: 3,
    });
    expect(
      profileCountsWithRelation(counts, rel({ theyRequested: true }), rel({ theyFollow: true })),
    ).toEqual({ followerCount: 10, followingCount: 4 });
    expect(profileCountsWithRelation(counts, rel(), rel({ iRequested: true }))).toEqual(counts);
  });
});
