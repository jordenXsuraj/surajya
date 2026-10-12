import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { getUnreadCount } from '@/api/endpoints/notifications';
import { queryKeys } from '@/api/queryKeys';
import { useAuthStore } from '@/stores/auth.store';

/** Unread notifications: every 60 s and when the app returns (one shared query). */
export function useUnreadCountQuery() {
  return useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: async () => (await getUnreadCount()).count,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}

/** The bell: also refetches whenever its screen comes into focus. */
export function useUnreadCount(): number {
  const query = useUnreadCountQuery();
  const { refetch } = query;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return query.data ?? 0;
}

/**
 * The web's Connect badges: pending follow requests (from the session, which every `me` refetch
 * and every Accept / Reject keeps current) + unread notifications.
 */
export function useActivityCounts() {
  const unread = useUnreadCountQuery().data ?? 0;
  const requests = useAuthStore((s) => s.user?.incomingRequestIds.length ?? 0);
  return { requests, unread, total: requests + unread };
}
