import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, layout } from '@/theme/tokens';

export const TOAST_MS = 2600;

/** Port of the web's useToast(): one message at a time, showing a new one replaces it. */
export function useToast() {
  const show = useUiStore((s) => s.showToast);
  const clear = useUiStore((s) => s.hideToast);
  return { show, clear };
}

const typeColor = { info: colors.muted, success: colors.green, error: colors.accent } as const;

// .toast-msg — mounted once in the root layout, above the tab bar. Tap to dismiss.
export function ToastHost() {
  const toast = useUiStore((s) => s.toast);
  const hide = useUiStore((s) => s.hideToast);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, hide]);

  if (!toast) return null;

  return (
    <Animated.View
      key={toast.id}
      entering={SlideInDown.springify().damping(18)}
      exiting={FadeOut.duration(150)}
      style={[styles.wrap, { bottom: insets.bottom + layout.tabBarHeight + 10 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={hide}
        style={styles.toast}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityHint="Tap to dismiss"
      >
        <Text style={[styles.text, { color: typeColor[toast.type] }]}>{toast.message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 9999 },
  toast: {
    width: '100%',
    maxWidth: 398,
    backgroundColor: colors.toast,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
  },
  text: { fontFamily: fonts.medium, fontSize: 13.1, lineHeight: 19 },
});
