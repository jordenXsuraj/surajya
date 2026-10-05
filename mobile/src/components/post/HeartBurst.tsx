import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

/** Big heart that pops and fades over the content after a double-tap like. */
export function HeartBurst({ trigger }: { trigger: number }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    if (reduceMotion) {
      opacity.set(withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 500 })));
      scale.set(1);
      return;
    }
    scale.set(0.3);
    opacity.set(1);
    scale.set(
      withSequence(
        withSpring(1.15, { damping: 9, stiffness: 220 }),
        withTiming(1, { duration: 120 }),
      ),
    );
    opacity.set(withSequence(withTiming(1, { duration: 420 }), withTiming(0, { duration: 260 })));
  }, [trigger, reduceMotion, opacity, scale]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));

  return (
    <Animated.Text
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.heart, style]}
    >
      ❤️
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  heart: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -40,
    fontSize: 72,
    lineHeight: 80,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowRadius: 12,
  },
});
