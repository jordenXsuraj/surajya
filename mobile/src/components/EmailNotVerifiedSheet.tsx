import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullWindowOverlay } from 'react-native-screens';

import { Button, Text } from '@/components/ui';
import { useModalSheet } from '@/hooks/useModalSheet';
import { useUiStore } from '@/stores/ui.store';
import { colors, layout } from '@/theme/tokens';

// iOS: without FullWindowOverlay the sheet renders behind native modals (e.g. the compose modal).
const IosOverlay = ({ children }: { children?: ReactNode }) => (
  <FullWindowOverlay>{children}</FullWindowOverlay>
);
const containerComponent = Platform.OS === 'ios' ? IosOverlay : undefined;

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

// Opened by the API client on 403 EMAIL_NOT_VERIFIED, anywhere in the app. Unlike the web toast,
// "Verify now →" is a real, tappable button.
export function EmailNotVerifiedSheet() {
  const { visible, message } = useUiStore((s) => s.verifySheet);
  const hide = useUiStore((s) => s.hideVerifySheet);
  const { ref, onDismiss } = useModalSheet(visible, hide);
  const insets = useSafeAreaInsets();

  function verifyNow() {
    hide();
    router.push('/verify-email');
  }

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
      containerComponent={containerComponent}
      accessibilityLabel="Verify your email"
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.emoji}>✉️</Text>
        <Text variant="title" align="center">
          Verify your email
        </Text>
        <Text variant="body" align="center" style={styles.message}>
          {message}
        </Text>
        <Button title="Verify now →" onPress={verifyNow} />
        <Button title="Not now" variant="ghost" onPress={hide} />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 8, gap: 6, alignItems: 'stretch' },
  emoji: { fontSize: 36, textAlign: 'center' },
  message: { marginTop: 2, marginBottom: 14 },
});
