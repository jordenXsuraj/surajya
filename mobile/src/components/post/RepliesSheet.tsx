import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetFooter,
  BottomSheetModal,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useCallback } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ReplyComposer } from '@/components/post/ReplyComposer';
import { ReplyItem } from '@/components/post/ReplyItem';
import { Text } from '@/components/ui/Text';
import { usePostActions } from '@/hooks/usePostActions';
import { useModalSheet } from '@/hooks/useModalSheet';
import { useDeleteReply } from '@/hooks/usePostMutations';
import { usePost } from '@/hooks/usePost';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, layout } from '@/theme/tokens';
import type { Reply } from '@/types/post';

const SNAP_POINTS = ['70%', '92%'];

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

/** Replies for one post, mounted once in the root layout; opened from any PostCard. */
export function RepliesSheet() {
  const postId = usePostUi((s) => s.repliesPostId);
  const focus = usePostUi((s) => s.repliesFocus);
  const close = usePostUi((s) => s.closeReplies);
  const { ref, onDismiss } = useModalSheet(Boolean(postId), close);
  const insets = useSafeAreaInsets();

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={insets.bottom}>
        {postId ? <SheetComposer postId={postId} autoFocus={focus} /> : null}
      </BottomSheetFooter>
    ),
    [postId, focus, insets.bottom],
  );

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing={false}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      {postId ? <RepliesList postId={postId} /> : null}
    </BottomSheetModal>
  );
}

function SheetComposer({ postId, autoFocus }: { postId: string; autoFocus: boolean }) {
  const { data: post } = usePost(postId);
  if (!post) return null;
  return <ReplyComposer post={post} inSheet autoFocus={autoFocus} />;
}

function RepliesList({ postId }: { postId: string }) {
  const { data: post, isPlaceholderData, isFetching, isError } = usePost(postId);
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const { mutate: deleteReply } = useDeleteReply();
  const actions = usePostActions();
  const close = usePostUi((s) => s.closeReplies);

  const onDelete = useCallback(
    (reply: Reply) => deleteReply({ postId, reply }),
    [deleteReply, postId],
  );
  const onPressAuthor = useCallback(
    (userId: string) => {
      close();
      actions.openProfile(userId);
    },
    [actions, close],
  );

  const replies = post?.replies ?? [];
  const isQa = post?.type === 'qa';

  return (
    <BottomSheetFlatList
      data={replies}
      keyExtractor={(r: Reply) => r._id}
      renderItem={({ item }: { item: Reply }) => (
        <ReplyItem
          reply={item}
          viewerId={viewerId}
          onDelete={onDelete}
          onPressAuthor={onPressAuthor}
        />
      )}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>
            {isQa ? '✍️ Answers' : '💬 Replies'}
            {replies.length ? ` (${replies.length})` : ''}
          </Text>
          {isFetching && isPlaceholderData ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {isError
            ? "Couldn't load replies. Check your connection."
            : isQa
              ? 'No answers yet. Be the first to answer.'
              : 'No replies yet. Start the conversation.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  list: { paddingHorizontal: layout.gutter, paddingBottom: 160 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 8,
  },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  empty: {
    fontFamily: fonts.regular,
    fontSize: 12.8,
    color: colors.dim,
    paddingVertical: 24,
    textAlign: 'center',
  },
});
