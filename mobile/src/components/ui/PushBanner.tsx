import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { useUiStore, type PushBanner } from '@/stores/ui.store';
import { colors, fonts } from '@/theme/tokens';

export const BANNER_MS = 6000;

// A push that arrives while the app is open shows here instead of the system alert (that one
// is turned off in src/lib/push.ts). Tap opens the post or profile it is about.
export function PushBannerHost() {
  const banner = useUiStore((s) => s.banner);
  const hide = useUiStore((s) => s.hideBanner);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!banner) return;
    // Development builds only: the Maestro runner reads this from logcat, like the toasts
    if (__DEV__ && process.env.NODE_ENV !== 'test') console.log(`[toast] push ${banner.body}`);
    const timer = setTimeout(hide, BANNER_MS);
    return () => clearTimeout(timer);
  }, [banner, hide]);

  if (!banner) return null;
  return <BannerView key={banner.id} banner={banner} top={insets.top + 6} onHide={hide} />;
}

type BannerViewProps = { banner: PushBanner; top: number; onHide: () => void };

// Slides down with React Native's Animated (Reanimated entering animations don't run on Android
// while a pushed screen is open; see Toast.tsx).
function BannerView({ banner, top, onHide }: BannerViewProps) {
  const reduceMotion = useReducedMotion();
  const [shown] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (reduceMotion) return;
    Animated.spring(shown, { toValue: 1, damping: 18, stiffness: 180, useNativeDriver: true }).start();
  }, [shown, reduceMotion]);

  const animatedStyle = {
    opacity: shown.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
    transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) }],
  } as const;

  return (
    <Animated.View style={[styles.wrap, { top }, animatedStyle]} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          onHide();
          router.push(banner.href as never);
        }}
        style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
        accessibilityRole="alert"
        accessibilityLabel={`${banner.title}: ${banner.body}`}
        accessibilityLiveRegion="polite"
        accessibilityHint="Opens it"
      >
        <View style={styles.dot} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {banner.title}
          </Text>
          <Text style={styles.text} numberOfLines={2}>
            {banner.body}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 10, right: 10, alignItems: 'center', zIndex: 10000 },
  banner: {
    width: '100%',
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.toast,
    boxShadow: '0 10px 30px rgba(0,0,0,0.55)',
  },
  pressed: { opacity: 0.9 },
  // the logo's accent dot (.ob-dot)
  dot: {
    width: 10,
    height: 10,
    marginHorizontal: 4,
    borderRadius: 5,
    backgroundColor: colors.accent,
    boxShadow: `0 0 12px ${colors.accent}`,
  },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.text },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted, marginTop: 1 },
});
