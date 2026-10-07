import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useSavedIds } from '@/hooks/useMe';
import { useBlockUser, useDeletePost, useSave } from '@/hooks/usePostMutations';
import { isOwnPost, postUrl, visibleAuthor } from '@/lib/postView';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';
import type { Post } from '@/types/post';

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

/** Web: same text the browser share sheet gets (title, first 100 characters, link). */
export async function sharePost(post: Post): Promise<void> {
  const url = postUrl(post._id);
  const snippet = decodeEntities(post.text).slice(0, 100);
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { title: 'MeetNet Post', message: snippet, url }
        : { title: 'MeetNet Post', message: snippet ? `${snippet}\n\n${url}` : url },
      { dialogTitle: 'Share post' },
    );
  } catch {
    // dismissed or unavailable
  }
}

// "⋯" on a post: Save, Share, Report, Block (named authors), Delete (own posts).
export function PostMenuSheet() {
  const ref = useRef<BottomSheetModal>(null);
  const post = usePostUi((s) => s.menuPost);
  const close = usePostUi((s) => s.closeMenu);
  const reported = usePostUi((s) => (post ? Boolean(s.reported[post._id]) : false));
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const savedIds = useSavedIds();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { mutate: save } = useSave();
  const { mutate: block } = useBlockUser();
  const { mutate: remove } = useDeletePost();

  useEffect(() => {
    if (post) ref.current?.present();
    else ref.current?.dismiss();
  }, [post]);

  const author = post ? visibleAuthor(post) : null;
  const own = post ? isOwnPost(post, viewerId) : false;
  const saved = post ? savedIds.has(post._id) : false;

  function then(fn: () => void) {
    close();
    fn();
  }

  function confirmBlock(p: Post) {
    const a = visibleAuthor(p);
    if (!a) return;
    const name = decodeEntities(a.name);
    Alert.alert(
      `Block ${name}?`,
      "You won't see each other's posts, replies or profiles, and any follow between you is removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => block({ id: String(a._id), name }) },
      ],
    );
  }

  function confirmDelete(p: Post) {
    Alert.alert('Delete this post?', 'It will be removed for everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove(p, {
            onSuccess: () => {
              if (pathname === `/post/${p._id}` && router.canGoBack()) router.back();
            },
          }),
      },
    ]);
  }

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={close}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        {post ? (
          <>
            <Item
              label={saved ? '🔖 Remove bookmark' : '🔖 Save Post'}
              onPress={() => then(() => save(post))}
            />
            <Item label="🔗 Share Post" onPress={() => then(() => void sharePost(post))} />
            {!own ? (
              <Item
                label={reported ? '🚩 Reported' : '🚩 Report Post'}
                disabled={reported}
                onPress={() => then(() => usePostUi.getState().openReport(post._id))}
              />
            ) : null}
            {!own && author ? (
              <Item
                label={`🚫 Block ${decodeEntities(author.name).split(' ')[0]}`}
                danger
                onPress={() => then(() => confirmBlock(post))}
              />
            ) : null}
            {own ? (
              <Item label="🗑️ Delete Post" danger onPress={() => then(() => confirmDelete(post))} />
            ) : null}
            <Item label="Cancel" muted onPress={close} />
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

type ItemProps = {
  label: string;
  onPress: () => void;
  danger?: boolean;
  muted?: boolean;
  disabled?: boolean;
};

function Item({ label, onPress, danger, muted, disabled }: ItemProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.item, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.itemText, danger && styles.danger, muted && styles.muted]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 4 },
  item: {
    minHeight: touch.min + 4,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.5 },
  itemText: { fontFamily: fonts.medium, fontSize: 15, color: colors.text },
  danger: { color: colors.accent },
  muted: { color: colors.muted, textAlign: 'center' },
});
