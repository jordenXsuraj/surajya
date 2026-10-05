import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

type LogoProps = { size?: 'lg' | 'sm' };

// .ob-logo + .ob-dot: Fraunces 800 wordmark with the accent dot's 2 s glow pulse (dotPulse).
export function Logo({ size = 'lg' }: LogoProps) {
  const large = size === 'lg';
  const reduceMotion = useReducedMotion();
  const glow = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    glow.set(
      withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [glow, reduceMotion]);

  const outerGlow = useAnimatedStyle(() => ({ opacity: glow.get() }));

  return (
    <View
      style={[styles.row, { gap: large ? 10 : 7 }]}
      accessibilityRole="header"
      accessibilityLabel="MeetNet"
    >
      <View style={styles.dotWrap}>
        <Animated.View style={[styles.dot, styles.glowWide, outerGlow]} />
        <View style={[styles.dot, styles.glow]} />
      </View>
      <Text
        style={[styles.word, large ? styles.large : styles.small]}
        maxFontSizeMultiplier={1.2}
        importantForAccessibility="no"
      >
        MeetNet
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  dotWrap: { width: 10, height: 10 },
  dot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  glow: { boxShadow: `0 0 14px ${colors.accent}` },
  glowWide: { boxShadow: `0 0 28px ${colors.accent}` },
  word: { fontFamily: fonts.display, color: colors.text },
  large: { fontSize: 48, letterSpacing: -2.4, lineHeight: 58 },
  small: { fontSize: 19.2, letterSpacing: -0.96, lineHeight: 26 },
});
