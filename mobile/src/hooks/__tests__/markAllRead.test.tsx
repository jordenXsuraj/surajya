import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { queryKeys } from '@/api/queryKeys';
import { useMarkAllReadWhileOpen, type MarkableList } from '@/hooks/useNotifications';
import { mockApi, resetAll } from '@/test/helpers';
import type { Notification } from '@/types/notification';

// Regression (found by Maestro p6-07): the cached list from the last visit still had unread rows,
// "mark all read" fired on it before this visit's fetch arrived, so the new notifications came
// back already read and never looked new.

const note = (id: string, read: boolean): Notification => ({
  _id: id,
  recipient: 'me',
  sender: { _id: 's', name: 'Sana Shaikh' },
  type: 'connection_request',
  post: null,
  message: 'Sana Shaikh wants to follow you',
  read,
  createdAt: '2026-10-10T08:00:00.000Z',
});

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } },
  });
  qc.setQueryData(queryKeys.unreadCount, 3);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

const markCalls = (calls: { method?: string; url?: string }[]) =>
  calls.filter((c) => c.method === 'put' && c.url === '/notifications/mark-read');

beforeEach(() => resetAll());

it('does not mark anything read from the cached list of the last visit', async () => {
  const calls = mockApi(() => ({ status: 200, data: { success: true } }));
  const { qc, wrapper } = setup();
  const cached: MarkableList = { items: [note('a', false)], dataUpdatedAt: 1000, isFetchedAfterMount: false };
  const { rerender, unmount } = await renderHook(
    ({ list }: { list: MarkableList }) => useMarkAllReadWhileOpen(true, list),
    { wrapper, initialProps: { list: cached } },
  );
  expect(markCalls(calls)).toHaveLength(0);
  expect(qc.getQueryData(queryKeys.unreadCount)).toBe(3);

  // this visit's fetch arrives, with unread items: now everything is marked read
  await rerender({ list: { items: [note('a', false), note('b', false)], dataUpdatedAt: 2000, isFetchedAfterMount: true } });
  await waitFor(() => expect(markCalls(calls)).toHaveLength(1));
  expect(qc.getQueryData(queryKeys.unreadCount)).toBe(0);

  // the same data again (a re-render) marks nothing more
  await rerender({ list: { items: [note('a', false), note('b', false)], dataUpdatedAt: 2000, isFetchedAfterMount: true } });
  expect(markCalls(calls)).toHaveLength(1);
  await unmount();
});

it('not while the list is off screen, and not when nothing is unread', async () => {
  const calls = mockApi(() => ({ status: 200, data: { success: true } }));
  const { wrapper } = setup();
  const fresh: MarkableList = { items: [note('a', false)], dataUpdatedAt: 1000, isFetchedAfterMount: true };
  const { rerender, unmount } = await renderHook(
    ({ active, list }: { active: boolean; list: MarkableList }) => useMarkAllReadWhileOpen(active, list),
    { wrapper, initialProps: { active: false, list: fresh } },
  );
  await rerender({ active: true, list: { items: [note('a', true)], dataUpdatedAt: 3000, isFetchedAfterMount: true } });
  expect(markCalls(calls)).toHaveLength(0);
  await unmount();
});
