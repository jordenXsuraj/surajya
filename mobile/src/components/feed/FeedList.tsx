import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useScrollToTop } from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { refreshFeed } from '@/api/postCache';
import { PostCard } from '@/components/post/PostCard';
import { FeedSkeleton } from '@/components/post/PostCardSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Text } from '@/components/ui/Text';
import type { useFeed } from '@/hooks/useFeed';
import { usePostActions } from '@/hooks/usePostActions';
import { useTabReselect } from '@/hooks/useTabReselect';
import { visibleAuthor } from '@/lib/postView';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts } from '@/theme/tokens';
import type { Post } from '@/types/post';

type FeedListProps = {
  query: ReturnType<typeof useFeed>;
  /** Posts to show (already filtered by the search box). */
  posts: Post[];
  queryKey: QueryKey;
  /** Shown when the loaded feed has nothing to show. */
  empty: ReactNode;
  /** Scrolls with the list (e.g. the verify-email banner). */
  header?: ReactElement | null;
  /** Changing this number scrolls the list to the top (e.g. after posting). */
  scrollSignal?: number;
};

const EMPTY_IDS: readonly string[] = [];

/**
 * FlashList feed: skeletons, pull-to-refresh (back to page 1), infinite scroll, error with retry,
 * "You're all caught up 🎉". Re-tapping the tab scrolls to the top and refreshes. Tabs stay mounted,
 * so the scroll position is kept when coming back from a post.
 */
export function FeedList({
  query,
  posts,
  queryKey,
  empty,
  header,
  scrollSignal = 0,
}: FeedListProps) {
  const qc = useQueryClient();
  const listRef = useRef<FlashListRef<Post>>(null);
  const [pulling, setPulling] = useState(false);
  const actions = usePostActions();
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const followingIds = useAuthStore((s) => s.user?.followingIds ?? EMPTY_IDS);
  const sentIds = useAuthStore((s) => s.user?.sentRequestIds ?? EMPTY_IDS);
  const following = useMemo(() => new Set(followingIds), [followingIds]);
  const sent = useMemo(() => new Set(sentIds), [sentIds]);

  const { hasNextPage, isFetchingNextPage, fetchNextPage, isFetchNextPageError } = query;

  const refresh = useCallback(async () => {
    await refreshFeed(qc, queryKey).catch(() => undefined);
  }, [qc, queryKey]);

  const onPull = useCallback(async () => {
    setPulling(true);
    await refresh();
    setPulling(false);
  }, [refresh]);

  useScrollToTop(listRef);
  useTabReselect(refresh);

  useEffect(() => {
    if (scrollSignal > 0) listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [scrollSignal]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: Post }) => {
      const authorId = visibleAuthor(item)?._id;
      const id = authorId ? String(authorId) : '';
      return (
        <PostCard
          post={item}
          viewerId={viewerId}
          following={!!id && following.has(id)}
          requested={!!id && sent.has(id)}
          actions={actions}
        />
      );
    },
    [viewerId, following, sent, actions],
  );

  if (query.isPending) return <FeedSkeleton />;
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const footer = isFetchingNextPage ? (
    <View style={styles.footer}>
      <ActivityIndicator color={colors.muted} />
      <Text style={styles.footerText}>Loading…</Text>
    </View>
  ) : isFetchNextPageError ? (
    <Pressable
      onPress={() => void fetchNextPage()}
      accessibilityRole="button"
      style={styles.footer}
    >
      <Text style={styles.footerText}>Couldn't load more. Tap to try again.</Text>
    </Pressable>
  ) : !hasNextPage && posts.length > 0 ? (
    <View style={styles.footer}>
      <Text style={styles.footerText}>You're all caught up 🎉</Text>
    </View>
  ) : null;

  return (
    <FlashList
      ref={listRef}
      data={posts}
      keyExtractor={keyOf}
      getItemType={typeOf}
      renderItem={renderItem}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // Off: a post the user just created is added at the top while Home is under the compose
      // screen; FlashList kept the old first post in place, the new one ended up above the screen
      // and was not drawn after the scroll back to the top (an empty gap where it should be).
      maintainVisibleContentPosition={{ disabled: true }}
      ListHeaderComponent={header}
      ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
      ListFooterComponent={footer}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
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

const keyOf = (post: Post) => post._id;
const typeOf = (post: Post) => (post.imageUrl ? 'image' : post.youtubeUrl ? 'video' : 'text');

const styles = StyleSheet.create({
  empty: { paddingHorizontal: 20 },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 20,
    minHeight: 44,
  },
  footerText: { fontFamily: fonts.regular, fontSize: 12, color: colors.dim },
});
