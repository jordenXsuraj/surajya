import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { getUnreadCount } from '@/api/endpoints/notifications';
import { queryKeys } from '@/api/queryKeys';

/** Unread notifications for the bell: every 60 s, when the app returns and when the screen focuses. */
export function useUnreadCount(): number {
  const query = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: async () => (await getUnreadCount()).count,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
  const { refetch } = query;

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return query.data ?? 0;
}
