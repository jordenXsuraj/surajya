import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';
import { FlatList, StyleSheet, View, type TextInput } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { PostCard } from '@/components/post/PostCard';
import { PostCardSkeleton } from '@/components/post/PostCardSkeleton';
import { ReplyComposer } from '@/components/post/ReplyComposer';
import { ReplyItem } from '@/components/post/ReplyItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Text } from '@/components/ui/Text';
import { usePost } from '@/hooks/usePost';
import { usePostActions } from '@/hooks/usePostActions';
import { useDeleteReply } from '@/hooks/usePostMutations';
import { visibleAuthor } from '@/lib/postView';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, layout } from '@/theme/tokens';
import type { Reply } from '@/types/post';

// Single post (also the target of themeetnet.com/post/:id links): full card, every reply inline,
// reply box pinned above the keyboard. Loads from the API even when nothing is cached.
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const query = usePost(id);
  const post = query.data;
  const composerRef = useRef<TextInput>(null);
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const followingIds = useAuthStore((s) => s.user?.followingIds);
  const sentIds = useAuthStore((s) => s.user?.sentRequestIds);
  const focusComposer = useCallback(() => composerRef.current?.focus(), []);
  const actions = usePostActions({ openReplies: focusComposer });
  const { mutate: deleteReply } = useDeleteReply();

  const onDeleteReply = useCallback(
    (reply: Reply) => id && deleteReply({ postId: id, reply }),
    [deleteReply, id],
  );

  const header = useMemo(() => {
    if (!post) return null;
    const authorId = visibleAuthor(post)?._id;
    const aid = authorId ? String(authorId) : '';
    const count = post.replies?.length ?? 0;
    return (
      <View>
        <PostCard
          post={post}
          viewerId={viewerId}
          following={!!aid && !!followingIds?.includes(aid)}
          requested={!!aid && !!sentIds?.includes(aid)}
          actions={actions}
          variant="detail"
        />
        <Text style={styles.repliesTitle}>
          {post.type === 'qa' ? '✍️ Answers' : '💬 Replies'}
          {count ? ` (${count})` : ''}
        </Text>
      </View>
    );
  }, [post, viewerId, followingIds, sentIds, actions]);

  let content;
  if (query.isPending) {
    content = <PostCardSkeleton withMedia />;
  } else if (query.isError && !post) {
    const status = query.error instanceof ApiError ? query.error.status : 0;
    content =
      status === 404 ? (
        <EmptyState
          emoji="🗑️"
          title="Post not available"
          message="This post was removed or expired"
          actionTitle="Go back"
          onAction={goBack}
        />
      ) : status === 400 ? (
        <EmptyState
          emoji="🔗"
          title="Link not valid"
          message="This post link doesn't look right. Check that it was copied completely."
          actionTitle="Go back"
          onAction={goBack}
        />
      ) : (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      );
  } else if (post) {
    content = (
      <>
        <FlatList
          data={post.replies ?? []}
          keyExtractor={(r) => r._id}
          renderItem={({ item }) => (
            <View style={styles.reply}>
              <ReplyItem
                reply={item}
                viewerId={viewerId}
                onDelete={onDeleteReply}
                onPressAuthor={actions.openProfile}
              />
            </View>
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {post.type === 'qa'
                ? 'No answers yet. Be the first to answer.'
                : 'No replies yet. Start the conversation.'}
            </Text>
          }
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        />
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View style={{ paddingBottom: insets.bottom }}>
            <ReplyComposer post={post} inputRef={composerRef} />
          </View>
        </KeyboardStickyView>
      </>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <BackButton />
      </View>
      {content}
    </View>
  );
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  bar: { paddingHorizontal: layout.gutter, borderBottomWidth: 1, borderBottomColor: colors.br },
  list: { paddingBottom: 24 },
  repliesTitle: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  reply: { paddingHorizontal: 16 },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 12.8,
    color: colors.dim,
    padding: 24,
    textAlign: 'center',
  },
});
