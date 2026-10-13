import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryKeys } from '@/api/queryKeys';
import { redirectSystemPath } from '@/app/+native-intent';
import { invalidateForPush } from '@/hooks/usePushNotifications';
import { useActivityCounts } from '@/hooks/useUnreadCount';
import { useAuthStore } from '@/stores/auth.store';
import { mockApi, resetAll, sessionUser } from '@/test/helpers';

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
}

/** Keys of the queries a push marked stale. */
function staleAfter(type: string, data: Record<string, string> = {}) {
  const qc = client();
  const keys = [
    queryKeys.notificationsList,
    queryKeys.unreadCount,
    queryKeys.requests,
    queryKeys.me,
    queryKeys.followingFeed,
    queryKeys.user('s1'),
    queryKeys.post('p1'),
    queryKeys.feed('global', 'all'),
  ];
  for (const key of keys) qc.setQueryData(key, { x: 1 });
  invalidateForPush(qc, { type, ...data });
  return keys
    .filter((key) => qc.getQueryState(key)?.isInvalidated)
    .map((key) => key.join('/'));
}

describe('invalidateForPush', () => {
  it('connection_request: notifications, requests and my session (badge)', () => {
    expect(staleAfter('connection_request', { senderId: 's1' })).toEqual([
      'notifications/list',
      'notifications/unread-count',
      'me/requests',
      'me',
    ]);
  });

  it('connection_accepted: I follow them now', () => {
    expect(staleAfter('connection_accepted', { senderId: 's1' })).toEqual([
      'notifications/list',
      'notifications/unread-count',
      'me',
      'feed/following',
      'user/s1/profile',
    ]);
  });

  it.each(['post_liked', 'post_replied', 'interested'])('%s: that post', (type) => {
    expect(staleAfter(type, { postId: 'p1' })).toEqual([
      'notifications/list',
      'notifications/unread-count',
      'post/p1',
    ]);
  });

  it('unknown types: only notifications; never the feeds', () => {
    expect(staleAfter('new_post', { postId: 'p1' })).toEqual([
      'notifications/list',
      'notifications/unread-count',
    ]);
  });
});

describe('Connect badge (web totalBadge)', () => {
  beforeEach(() => resetAll());

  it('pending requests from the session + unread notifications', async () => {
    useAuthStore.setState({
      status: 'signedIn',
      token: 't',
      user: { ...sessionUser(), incomingRequestIds: ['a', 'b', 'c'] },
    });
    mockApi(() => ({ status: 200, data: { count: 5 } }));
    const qc = client();
    qc.setQueryData(queryKeys.unreadCount, 5);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result, unmount } = await renderHook(() => useActivityCounts(), { wrapper });
    expect(result.current).toEqual({ requests: 3, unread: 5, total: 8 });
    await unmount(); // stops the 60 s refetch timer
    qc.clear();
  });
});

describe('+native-intent', () => {
  beforeEach(() => resetAll());

  it('signed in: opens the link', () => {
    useAuthStore.setState({ status: 'signedIn', token: 't', user: sessionUser() });
    expect(redirectSystemPath({ path: 'https://themeetnet.com/post/p1', initial: true })).toBe(
      '/post/p1',
    );
    expect(useAuthStore.getState().pendingPath).toBeNull();
  });

  it('signed out: start screen now, the link after sign-in; logout forgets it', () => {
    useAuthStore.setState({ status: 'signedOut' });
    expect(redirectSystemPath({ path: 'meetnet://profile/u9', initial: true })).toBe('/');
    expect(useAuthStore.getState().pendingPath).toBe('/profile/u9');
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().pendingPath).toBeNull();
  });

  it('other links pass through untouched', () => {
    useAuthStore.setState({ status: 'signedIn', token: 't', user: sessionUser() });
    expect(redirectSystemPath({ path: 'https://example.com/x', initial: false })).toBe(
      'https://example.com/x',
    );
  });
});
