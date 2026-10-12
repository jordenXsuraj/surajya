import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useFocusEffect, useIsFocused, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SegmentedTabs } from '@/components/connect/SegmentedTabs';
import { NotificationList } from '@/components/notifications/NotificationList';
import { PersonRowItem } from '@/components/profile/PersonRowItem';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useFollowActions } from '@/hooks/useFollow';
import { useRequests } from '@/hooks/useProfile';
import { useTabReselect } from '@/hooks/useTabReselect';
import { useActivityCounts } from '@/hooks/useUnreadCount';
import { useAuthStore } from '@/stores/auth.store';
import { colors, layout } from '@/theme/tokens';
import type { PersonRow } from '@/types/user';

type Sub = 'requests' | 'notifications';

// Web Connect → Activity: follow requests (Accept / Reject right in the row; the row leaves at
// once) and notifications. Opens on Notifications when there are no requests but unread
// notifications, like the web.
export function Activity() {
  const counts = useActivityCounts();
  const [sub, setSub] = useState<Sub>(() =>
    counts.requests === 0 && counts.unread > 0 ? 'notifications' : 'requests',
  );
  const focused = useIsFocused();
  const requests = useRequests();
  const requestCount = requests.data?.length ?? counts.requests;

  return (
    <View style={styles.root}>
      <View style={styles.subTabs}>
        <SegmentedTabs
          look="solid"
          value={sub}
          onChange={setSub}
          segments={[
            { key: 'requests', label: '🤝 Requests', badge: requestCount },
            { key: 'notifications', label: '🔔 Notifications', badge: counts.unread },
          ]}
        />
      </View>
      {sub === 'requests' ? (
        <RequestList query={requests} />
      ) : (
        <NotificationList active={focused} />
      )}
    </View>
  );
}

function RequestList({ query }: { query: ReturnType<typeof useRequests> }) {
  const insets = useSafeAreaInsets();
  const actions = useFollowActions();
  const myId = useAuthStore((s) => s.user?._id ?? '');
  const listRef = useRef<FlashListRef<PersonRow>>(null);
  const [pulling, setPulling] = useState(false);
  const refetch = query.refetch;

  useScrollToTop(listRef);
  useTabReselect(useCallback(() => void refetch(), [refetch]));
  // New requests arrive while the app is open: refresh whenever Connect comes back into view
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  const onPull = useCallback(async () => {
    setPulling(true);
    await refetch().catch(() => undefined);
    setPulling(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item, index }: { item: PersonRow; index: number }) => (
      <PersonRowItem person={item} index={index} myId={myId} actions={actions} />
    ),
    [myId, actions],
  );

  if (query.isPending)
    return (
      <View style={styles.skeletons}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={72} radius={16} />
        ))}
      </View>
    );
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void refetch()} />;

  return (
    <FlashList
      ref={listRef}
      data={query.data ?? []}
      keyExtractor={(p) => String(p._id)}
      renderItem={renderItem}
      contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
      ListEmptyComponent={
        <EmptyState
          emoji="📭"
          title="No pending requests"
          message="When someone asks to follow you, it shows up here."
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPull}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg3}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  subTabs: { paddingHorizontal: layout.gutter, paddingTop: 10, paddingBottom: 6 },
  skeletons: { paddingHorizontal: layout.gutter, gap: 10, paddingTop: 8 },
});
