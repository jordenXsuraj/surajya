import { useEffect } from 'react';
import type { DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { colors, radius as radii } from '@/theme/tokens';

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
};

// Pulsing placeholder block for loading lists.
export function Skeleton({ width = '100%', height = 14, radius = radii.sm }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(
      withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }), -1, true),
    );
  }, [opacity, reduceMotion]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.bg3 }, animated]}
    />
  );
}
