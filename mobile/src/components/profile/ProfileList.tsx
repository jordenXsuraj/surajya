import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useMemo, type ReactElement, type ReactNode, type Ref } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { MediaGrid } from '@/components/profile/MediaGrid';
import { PostCard } from '@/components/post/PostCard';
import { usePostActions } from '@/hooks/usePostActions';
import { visibleAuthor } from '@/lib/postView';
import { useAuthStore } from '@/stores/auth.store';
import { colors, layout } from '@/theme/tokens';
import type { Post } from '@/types/post';
import type { MediaItem } from '@/types/user';

export type ProfileRow =
  | { kind: 'post'; post: Post }
  | { kind: 'media'; items: MediaItem[] | undefined }
  /** Loading, empty and error states of the current tab. */
  | { kind: 'state'; key: string; node: ReactNode };

type ProfileListProps = {
  listRef?: Ref<FlashListRef<ProfileRow>>;
  /** Profile header, sections and tabs: scroll with the list. */
  header: ReactElement;
  rows: ProfileRow[];
  isOwn: boolean;
  onAddMedia?: () => void;
  onEndReached?: () => void;
  footer?: ReactElement | null;
  refreshing: boolean;
  onRefresh: () => void;
};

const EMPTY_IDS: readonly string[] = [];

/**
 * One scrolling list for a profile: the header on top, then the current tab (posts as PostCards,
 * the media grid, or a loading / empty / error state). Posts get the same actions as the feeds.
 */
export function ProfileList({
  listRef,
  header,
  rows,
  isOwn,
  onAddMedia,
  onEndReached,
  footer,
  refreshing,
  onRefresh,
}: ProfileListProps) {
  const actions = usePostActions();
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const followingIds = useAuthStore((s) => s.user?.followingIds ?? EMPTY_IDS);
  const sentIds = useAuthStore((s) => s.user?.sentRequestIds ?? EMPTY_IDS);
  const following = useMemo(() => new Set(followingIds), [followingIds]);
  const sent = useMemo(() => new Set(sentIds), [sentIds]);

  const renderItem = useCallback(
    ({ item }: { item: ProfileRow }) => {
      if (item.kind === 'state') return <View style={styles.state}>{item.node}</View>;
      if (item.kind === 'media') {
        return (
          <View style={styles.media}>
            <MediaGrid items={item.items} isOwn={isOwn} onAdd={onAddMedia} />
          </View>
        );
      }
      const authorId = visibleAuthor(item.post)?._id;
      const id = authorId ? String(authorId) : '';
      return (
        <PostCard
          post={item.post}
          viewerId={viewerId}
          following={!!id && following.has(id)}
          requested={!!id && sent.has(id)}
          actions={actions}
        />
      );
    },
    [isOwn, onAddMedia, viewerId, following, sent, actions],
  );

  return (
    <FlashList
      ref={listRef}
      data={rows}
      keyExtractor={keyOf}
      getItemType={typeOf}
      renderItem={renderItem}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.6}
      // Off for the same reason as the feeds (FeedList): switching tabs replaces every row
      maintainVisibleContentPosition={{ disabled: true }}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg3}
        />
      }
    />
  );
}

const keyOf = (row: ProfileRow) =>
  row.kind === 'post' ? row.post._id : row.kind === 'media' ? 'media' : `state-${row.key}`;
const typeOf = (row: ProfileRow) =>
  row.kind === 'post'
    ? row.post.imageUrl
      ? 'image'
      : row.post.youtubeUrl
        ? 'video'
        : 'text'
    : row.kind;

const styles = StyleSheet.create({
  content: { paddingBottom: 32 },
  state: { paddingHorizontal: layout.gutter, paddingVertical: 8 },
  media: { paddingHorizontal: 15 },
});
