import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { router, usePathname } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MenuItem } from '@/components/post/PostMenuSheet';
import { useBlockUser } from '@/hooks/useFollow';
import { useModalSheet } from '@/hooks/useModalSheet';
import { shareProfile } from '@/lib/profile';
import { usePostUi } from '@/stores/postUi.store';
import { colors, layout } from '@/theme/tokens';

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

// "⋯" on someone's profile: Share profile, Report user, Block. Blocking leaves the profile
// (it is no longer visible) and takes their posts out of every list.
export function ProfileMenuSheet() {
  const user = usePostUi((s) => s.menuUser);
  const close = usePostUi((s) => s.closeUserMenu);
  const { ref, onDismiss } = useModalSheet(Boolean(user), close);
  const reported = usePostUi((s) => (user ? Boolean(s.reported[user.id]) : false));
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { mutate: block } = useBlockUser();

  function then(fn: () => void) {
    close();
    fn();
  }

  function confirmBlock(id: string, name: string) {
    Alert.alert(
      `Block ${name}?`,
      "You won't see each other's posts, replies or profiles, and any follow between you is removed.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            block(
              { id, name },
              {
                onSuccess: () => {
                  if (pathname.startsWith(`/profile/${id}`) && router.canGoBack()) router.back();
                },
              },
            ),
        },
      ],
    );
  }

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
        {user ? (
          <>
            <MenuItem
              label="🔗 Share profile"
              onPress={() => then(() => void shareProfile(user.id, user.name))}
            />
            <MenuItem
              label={reported ? '🚩 Reported' : '🚩 Report user'}
              disabled={reported}
              onPress={() =>
                then(() => usePostUi.getState().openReport({ kind: 'user', id: user.id }))
              }
            />
            <MenuItem
              label={`🚫 Block ${user.name.split(' ')[0]}`}
              danger
              onPress={() => then(() => confirmBlock(user.id, user.name))}
            />
            <MenuItem label="Cancel" muted onPress={close} />
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 4 },
});
