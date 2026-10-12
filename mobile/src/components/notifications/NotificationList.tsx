import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router, useScrollToTop } from 'expo-router';
import { memo, useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/api/queryKeys';
import { PagingFooter } from '@/components/connect/PagingFooter';
import { Avatar, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import {
  useMarkAllReadWhileOpen,
  useMarkNotificationRead,
  useNotificationsList,
} from '@/hooks/useNotifications';
import { useTabReselect } from '@/hooks/useTabReselect';
import {
  notificationTarget,
  notificationText,
  notifMeta,
  postOf,
  senderOf,
  type NotificationRow,
} from '@/lib/notifications';
import { decodeEntities } from '@/lib/text';
import { timeAgo } from '@/lib/time';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, layout } from '@/theme/tokens';
import type { Notification } from '@/types/notification';

type NotificationListProps = {
  /** On screen now: unread items are marked read once the list has loaded. */
  active: boolean;
};

const typeOf = (row: NotificationRow) => row.kind;

// Web Connect → Activity → Notifications, grouped Today / This week / Earlier. Tapping opens the
// post (likes, replies, interest, new posts) or the person (follow requests and accepts).
export function NotificationList({ active }: NotificationListProps) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const query = useNotificationsList();
  const { rows, items, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } =
    query;
  const { mutate: markRead } = useMarkNotificationRead();
  const listRef = useRef<FlashListRef<NotificationRow>>(null);
  const [pulling, setPulling] = useState(false);

  useMarkAllReadWhileOpen(active, query);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: queryKeys.notificationsList, exact: true }),
      qc.refetchQueries({ queryKey: queryKeys.unreadCount, exact: true }),
    ]).catch(() => undefined);
  }, [qc]);

  useScrollToTop(listRef);
  useTabReselect(useCallback(() => void refresh(), [refresh]));

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const open = useCallback(
    (n: Notification) => {
      markRead(String(n._id)); // also when already read (opening the list marks all read)
      const target = notificationTarget(n);
      if (target.kind === 'open') router.push(target.path);
      else if (target.kind === 'postGone')
        useUiStore.getState().showToast('This post is no longer available', 'info');
    },
    [markRead],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: NotificationRow; index: number }) =>
      item.kind === 'header' ? (
        <Text style={styles.header} accessibilityRole="header">
          {item.title}
        </Text>
      ) : (
        <NotificationItem notification={item.notification} index={index} onOpen={open} />
      ),
    [open],
  );

  if (query.isPending)
    return (
      <View style={styles.skeletons}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={64} radius={14} />
        ))}
      </View>
    );
  if (query.isError && items.length === 0)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  return (
    <FlashList
      ref={listRef}
      data={rows}
      keyExtractor={(row) => row.key}
      getItemType={typeOf}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      ListEmptyComponent={
        <EmptyState
          emoji="🔔"
          title="No notifications yet"
          message="Likes, replies and follow requests will show up here."
        />
      }
      ListFooterComponent={
        <PagingFooter
          count={items.length}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isFetchNextPageError={isFetchNextPageError}
          fetchNextPage={fetchNextPage}
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

type NotificationItemProps = {
  notification: Notification;
  index: number;
  onOpen: (n: Notification) => void;
};

const NotificationItem = memo(function NotificationItem({
  notification: n,
  index,
  onOpen,
}: NotificationItemProps) {
  const sender = senderOf(n);
  const name = sender ? decodeEntities(sender.name) : 'Someone';
  const meta = notifMeta(n.type);
  const text = notificationText(n);
  const post = postOf(n);
  const snippet = post?.text ? decodeEntities(post.text).replace(/\s+/g, ' ').trim() : '';
  const when = timeAgo(n.createdAt);
  const unread = !n.read;

  return (
    <Pressable
      onPress={() => onOpen(n)}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${text}${snippet ? `: ${snippet}` : ''}. ${when}${unread ? '. Unread' : ''}`}
      style={({ pressed }) => [styles.item, unread && styles.unread, pressed && styles.pressed]}
    >
      <View>
        <Avatar name={name} uri={sender?.avatar || null} size={44} colorIndex={index} />
        <View style={[styles.icon, { borderColor: meta.color }]}>
          <Text style={styles.iconText} maxFontSizeMultiplier={1}>
            {meta.icon}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.text}>
          <Text style={styles.sender}>{name}</Text> {text}
        </Text>
        {snippet ? (
          <Text style={styles.snippet} numberOfLines={1}>
            {snippet}
          </Text>
        ) : null}
        <Text style={styles.time}>{when}</Text>
      </View>
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  skeletons: { paddingHorizontal: layout.gutter, gap: 10, paddingTop: 12 },
  header: {
    paddingHorizontal: layout.gutter,
    paddingTop: 14,
    paddingBottom: 8,
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 0.4,
    color: colors.muted,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: layout.gutter,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  // web: rgba(255,59,92,.04) background, .15 border
  unread: { backgroundColor: colors.unreadBg, borderColor: colors.unreadBorder },
  pressed: { opacity: 0.85 },
  icon: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg2,
  },
  iconText: { fontSize: 10, lineHeight: 13 },
  body: { flex: 1, minWidth: 0 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  sender: { fontFamily: fonts.bold, color: colors.text },
  snippet: {
    marginTop: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 7,
    borderLeftWidth: 2,
    borderLeftColor: colors.br2,
    backgroundColor: colors.bg3,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.dim,
  },
  time: { marginTop: 4, fontFamily: fonts.regular, fontSize: 10.5, color: colors.dim },
  dot: {
    width: 8,
    height: 8,
    marginTop: 6,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
