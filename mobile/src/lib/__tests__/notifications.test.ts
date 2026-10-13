import {
  NOTIF_META,
  notificationRows,
  notificationTarget,
  notificationText,
  pushPath,
} from '@/lib/notifications';
import type { Notification, NotificationType } from '@/types/notification';

const sender = { _id: 'sender1', name: 'Meera Joshi', year: '3rd' as const, branch: 'IT' };

const notification = (patch: Partial<Notification> = {}): Notification => ({
  _id: 'n1',
  recipient: 'me',
  sender,
  type: 'post_liked',
  post: { _id: 'post1', type: 'study', text: 'DSA sheet' },
  message: 'Meera Joshi liked your post',
  read: false,
  createdAt: '2026-10-09T08:00:00.000Z',
  ...patch,
});

describe('notificationTarget (tap → screen)', () => {
  it.each(['post_liked', 'post_replied', 'interested', 'new_post'] as NotificationType[])(
    '%s opens the post',
    (type) => {
      expect(notificationTarget(notification({ type }))).toEqual({
        kind: 'open',
        path: '/post/post1',
      });
    },
  );

  it.each(['connection_request', 'connection_accepted'] as NotificationType[])(
    '%s opens the sender',
    (type) => {
      expect(notificationTarget(notification({ type, post: null }))).toEqual({
        kind: 'open',
        path: '/profile/sender1',
      });
    },
  );

  it('works with unpopulated ids too', () => {
    expect(notificationTarget(notification({ post: 'post9' }))).toEqual({
      kind: 'open',
      path: '/post/post9',
    });
    expect(
      notificationTarget(notification({ type: 'connection_request', sender: 'sender9' })),
    ).toEqual({ kind: 'open', path: '/profile/sender9' });
  });

  it('a deleted post says so; a deleted sender opens nothing', () => {
    expect(notificationTarget(notification({ post: null }))).toEqual({ kind: 'postGone' });
    expect(
      notificationTarget(notification({ type: 'connection_accepted', sender: null, post: null })),
    ).toEqual({ kind: 'none' });
  });
});

describe('notification text and icons', () => {
  it('uses the follow wording and the post type', () => {
    expect(notificationText(notification({ type: 'connection_request' }))).toBe(
      'wants to follow you',
    );
    expect(notificationText(notification({ type: 'connection_accepted' }))).toBe(
      'accepted your follow request',
    );
    expect(notificationText(notification({ type: 'interested' }))).toBe(
      'is interested in your study post',
    );
    expect(
      notificationText(
        notification({ type: 'new_post', post: { _id: 'p', type: 'qa', text: 'Q' } }),
      ),
    ).toBe('shared a new Q&A post');
    expect(notificationText(notification({ type: 'new_post', post: 'p' }))).toBe(
      'shared a new post',
    );
  });

  it('has an icon for every type, interested included (the web lacks it)', () => {
    for (const type of [
      'connection_request',
      'connection_accepted',
      'post_replied',
      'post_liked',
      'new_post',
      'interested',
    ] as NotificationType[]) {
      expect(NOTIF_META[type].icon).toBeTruthy();
    }
  });
});

describe('notificationRows (Today / This week / Earlier)', () => {
  // Thursday 9 Oct 2026, 10:30 local time
  const now = new Date(2026, 9, 9, 10, 30).getTime();
  const at = (days: number, hours = 0) =>
    new Date(new Date(2026, 9, 9, 0, 0).getTime() - days * 86_400_000 + hours * 3_600_000);

  it('groups by local day, newest first, regardless of the server order', () => {
    const items = [
      notification({ _id: 'old', createdAt: at(7, 23).toISOString(), read: true }),
      notification({ _id: 'today-early', createdAt: at(0, 0.1).toISOString() }),
      notification({ _id: 'yesterday-late', createdAt: at(1, 23.9).toISOString() }),
      notification({ _id: 'six-days', createdAt: at(6).toISOString() }),
      notification({ _id: 'today-late', createdAt: at(0, 10).toISOString() }),
    ];
    const rows = notificationRows(items, now).map((r) =>
      r.kind === 'header' ? `# ${r.title}` : r.key,
    );
    expect(rows).toEqual([
      '# Today',
      'today-late',
      'today-early',
      '# This week',
      'yesterday-late',
      'six-days',
      '# Earlier',
      'old',
    ]);
  });

  it('leaves out empty sections and repeated items', () => {
    const one = notification({ _id: 'a', createdAt: at(10).toISOString() });
    expect(notificationRows([one, one], now).map((r) => r.key)).toEqual(['h-Earlier', 'a']);
    expect(notificationRows([], now)).toEqual([]);
  });
});

describe('pushPath (tap on a push)', () => {
  it("uses the server's url when the app has that screen", () => {
    expect(pushPath({ url: '/post/abc', postId: 'abc' })).toBe('/post/abc');
    expect(pushPath({ url: '/profile/u1' })).toBe('/profile/u1');
    expect(pushPath({ url: 'https://themeetnet.com/post/abc?utm=push' })).toBe('/post/abc');
  });

  it('falls back to the post, the sender, then the notifications screen', () => {
    expect(pushPath({ url: '/admin', postId: 'p1' })).toBe('/post/p1');
    expect(pushPath({ url: 'https://evil.example/post/1', senderId: 's1' })).toBe('/profile/s1');
    expect(pushPath({})).toBe('/notifications');
    expect(pushPath(null)).toBe('/notifications');
  });
});
