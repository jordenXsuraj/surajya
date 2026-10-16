import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuItem } from '@/components/post/PostMenuSheet';
import { useBlockUser } from '@/hooks/useFollow';
import { useModalSheet } from '@/hooks/useModalSheet';
import { useDeleteReply } from '@/hooks/usePostMutations';
import { isOwnReply } from '@/lib/postView';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi, type ReplyMenuTarget } from '@/stores/postUi.store';
import { colors, layout } from '@/theme/tokens';

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

// Long-press (or ⋯) on a reply: Report reply and Block its author; Delete on your own reply.
// The anonymous author's replies carry no author, so they can be reported but not blocked.
export function ReplyMenuSheet() {
  const target = usePostUi((s) => s.menuReply);
  const close = usePostUi((s) => s.closeReplyMenu);
  const { ref, onDismiss } = useModalSheet(Boolean(target), close);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        {target ? <ReplyMenu target={target} close={close} /> : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function ReplyMenu({ target, close }: { target: ReplyMenuTarget; close: () => void }) {
  const { postId, reply } = target;
  const viewerId = useAuthStore((s) => s.user?._id ?? '');
  const reported = usePostUi((s) => Boolean(s.reported[reply._id]));
  const { mutate: block } = useBlockUser();
  const { mutate: deleteReply } = useDeleteReply();

  const own = isOwnReply(reply, viewerId);
  const authorId = reply.postedBy?._id ? String(reply.postedBy._id) : null;
  const name = reply.postedBy ? decodeEntities(reply.postedBy.name) : '';

  function then(fn: () => void) {
    close();
    fn();
  }

  function confirmBlock(id: string) {
    Alert.alert(
      `Block ${name}?`,
      "You won't see each other's posts, replies or profiles, and any follow between you is removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => block({ id, name }) },
      ],
    );
  }

  if (own) {
    return (
      <>
        <MenuItem
          label="🗑️ Delete reply"
          danger
          onPress={() => then(() => deleteReply({ postId, reply }))}
        />
        <MenuItem label="Cancel" muted onPress={close} />
      </>
    );
  }

  return (
    <>
      <MenuItem
        label={reported ? '🚩 Reported' : '🚩 Report reply'}
        disabled={reported}
        onPress={() =>
          then(() => usePostUi.getState().openReport({ kind: 'reply', id: reply._id, postId }))
        }
      />
      {authorId && authorId !== viewerId ? (
        <MenuItem
          label={`🚫 Block ${name.split(' ')[0]}`}
          danger
          onPress={() => then(() => confirmBlock(authorId))}
        />
      ) : null}
      <MenuItem label="Cancel" muted onPress={close} />
    </>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 4 },
});
