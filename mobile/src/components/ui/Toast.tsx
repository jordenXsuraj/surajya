import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useKeyboardAnimation } from 'react-native-keyboard-controller';
import { useReducedMotion } from 'react-native-reanimated';
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
    // Development builds only: the Maestro runner (.maestro/run.mjs) reads every toast from logcat
    // (on screen for 2.6 s, shorter than one of its screen reads)
    if (__DEV__ && process.env.NODE_ENV !== 'test')
      console.log(`[toast] ${toast.type} ${toast.message}`);
    const timer = setTimeout(hide, TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast, hide]);

  if (!toast) return null;

  return (
    <ToastView
      key={toast.id}
      message={toast.message}
      color={typeColor[toast.type]}
      bottom={insets.bottom + layout.tabBarHeight + 10}
      onPress={hide}
    />
  );
}

type ToastViewProps = { message: string; color: string; bottom: number; onPress: () => void };

// Springs up into place with React Native's Animated (native driver). Reanimated entering
// animations and springs started on mount never run on Android while a pushed screen (post,
// compose) is open, so the toast stayed invisible there. With the keyboard open (compose,
// replies) it sits just above the keyboard.
function ToastView({ message, color, bottom, onPress }: ToastViewProps) {
  const reduceMotion = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  const { height: keyboard } = useKeyboardAnimation(); // 0, or minus the keyboard height

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(shown, {
      toValue: 1,
      damping: 18,
      stiffness: 180,
      useNativeDriver: true,
    }).start();
  }, [shown, reduceMotion]);

  const animatedStyle = {
    opacity: shown.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0, 1, 1],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        translateY: Animated.add(
          shown.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }),
          // keyboard + bottom - 10, never below 0: just above an open keyboard
          keyboard.interpolate({
            inputRange: [-2000, 10 - bottom, 0],
            outputRange: [-2000 + bottom - 10, 0, 0],
            extrapolate: 'clamp',
          }),
        ),
      },
    ],
  } as const;

  return (
    <Animated.View style={[styles.wrap, { bottom }, animatedStyle]} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        style={styles.toast}
        accessibilityRole="alert"
        accessibilityLabel={message}
        accessibilityLiveRegion="polite"
        accessibilityHint="Tap to dismiss"
      >
        <Text style={[styles.text, { color }]}>{message}</Text>
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
