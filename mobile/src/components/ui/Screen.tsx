import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme/tokens';

type ScreenProps = {
  children: ReactNode;
  /** Keyboard-aware scrolling (forms). */
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned under the scroll content (e.g. step 2 footer). */
  footer?: ReactNode;
};

export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  padded = true,
  contentStyle,
  footer,
}: ScreenProps) {
  const inner = [padded && styles.padded, styles.content, contentStyle];

  return (
    <SafeAreaView style={styles.root} edges={edges}>
      {scroll ? (
        <KeyboardAwareScrollView
          style={styles.flex}
          contentContainerStyle={[styles.grow, inner]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <View style={[styles.flex, inner]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  padded: { paddingHorizontal: layout.gutter },
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' },
});
