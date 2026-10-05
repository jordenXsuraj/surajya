import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, fontSize, radius, touch } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';

export type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  /** Text shown while loading (web: "Please wait…", "Checking…"). */
  loadingTitle?: string;
  icon?: ReactNode;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
  testID?: string;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  loadingTitle,
  icon,
  haptic = true,
  style,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const inactive = disabled || loading;

  function handlePress() {
    if (inactive) return;
    if (haptic && variant === 'primary')
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  const label = loading && loadingTitle ? loadingTitle : title;

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={variant === 'link' ? touch.hitSlop : undefined}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !inactive && styles.pressed,
        pressed && !inactive && variant === 'primary' && styles.primaryPressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading && !loadingTitle ? (
          <ActivityIndicator color={variant === 'primary' ? colors.white : colors.muted} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, labelStyles[variant]]} numberOfLines={1}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // .ob-btn
  primary: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    boxShadow: `0 8px 24px ${colors.ag}`,
  },
  primaryPressed: { boxShadow: `0 12px 32px ${colors.ag}` },
  // .ob-demo
  secondary: {
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
  },
  ghost: {
    minHeight: touch.min,
    borderRadius: radius.md,
  },
  link: {
    minHeight: touch.min,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.6 },
  label: { fontFamily: fonts.semibold, fontSize: fontSize.md },
});

const labelStyles = StyleSheet.create({
  primary: {
    fontFamily: fonts.extrabold,
    fontSize: fontSize.lg,
    color: colors.white,
    letterSpacing: -0.16,
  },
  secondary: { color: colors.text },
  ghost: { color: colors.muted },
  link: { color: colors.muted, fontSize: fontSize.sm },
});
