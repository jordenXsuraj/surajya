import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Room between the focused field and a KeyboardFooter (the scroll view's bottomOffset). */
export const FOOTER_GAP = 16;

/**
 * A form screen's main action (Post, Save changes, Create account): under the content, and on top
 * of the keyboard while it is open, however tall the keyboard is (SwiftKey with its toolbar and
 * number row covers almost half of a phone screen). `onHeight` reports the footer's height, so the
 * scroll view keeps the focused field above the footer (bottomOffset = height + FOOTER_GAP).
 */
export function KeyboardFooter({
  children,
  onHeight,
  style,
}: {
  children: ReactNode;
  onHeight?: (height: number) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
      <View
        style={style}
        testID="keyboard-footer"
        onLayout={(e) => onHeight?.(Math.ceil(e.nativeEvent.layout.height))}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}
