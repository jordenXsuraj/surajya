import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_PAGE_SIZE,
} from '@/api/endpoints/notifications';
import { queryKeys } from '@/api/queryKeys';
import { notificationRows } from '@/lib/notifications';
import type { Notification } from '@/types/notification';

type Pages = InfiniteData<Notification[], number>;

/** GET /notifications, 25 per page, as Today / This week / Earlier rows. */
export function useNotificationsList() {
  const query = useInfiniteQuery({
    queryKey: queryKeys.notificationsList,
    queryFn: ({ pageParam }) => getNotifications(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last, all) =>
      last.length < NOTIFICATIONS_PAGE_SIZE ? undefined : all.length + 1,
  });
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const rows = useMemo(() => notificationRows(items), [items]);
  return { ...query, items, rows };
}

/** What useMarkAllReadWhileOpen reads from the list query. */
export type MarkableList = {
  items: readonly Notification[];
  dataUpdatedAt: number;
  /** Fetched during this visit (not just the cached list from the last one). */
  isFetchedAfterMount: boolean;
};

/**
 * Marks everything read once this visit's own fetch shows unread items while the list is on
 * screen (web: opening the Notifications tab). Never on the cached list from the last visit: that
 * would mark the new ones read on the server before they arrived, and they would never look new.
 * The rows keep their unread look for this visit; the bell and badges go to 0 at once.
 */
export function useMarkAllReadWhileOpen(active: boolean, list: MarkableList) {
  const qc = useQueryClient();
  const marked = useRef(0);
  const { mutate } = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => qc.setQueryData(queryKeys.unreadCount, 0),
    onError: () => void qc.invalidateQueries({ queryKey: queryKeys.unreadCount }),
  });
  const { items, dataUpdatedAt, isFetchedAfterMount } = list;

  useEffect(() => {
    if (!active || !isFetchedAfterMount || !dataUpdatedAt || marked.current === dataUpdatedAt) return;
    if (!items.some((n) => !n.read)) return;
    marked.current = dataUpdatedAt;
    mutate();
  }, [active, isFetchedAfterMount, items, dataUpdatedAt, mutate]);
}

/** PUT /notifications/:id/read whenever a row is opened; the row loses its unread look at once. */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => {
      qc.setQueryData<Pages>(queryKeys.notificationsList, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) =>
                page.map((n) => (String(n._id) === id && !n.read ? { ...n, read: true } : n)),
              ),
            }
          : data,
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: queryKeys.unreadCount }),
  });
}
