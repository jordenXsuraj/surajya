import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, radius, touch } from '@/theme/tokens';

export type ProfileButtonProps = {
  label: string;
  /** Spoken label when the visible text is not enough ("Follow Riya"). */
  a11y?: string;
  kind: 'primary' | 'secondary' | 'muted';
  compact?: boolean;
  /** No handler = disabled (e.g. "⏳ Requested"). */
  onPress?: () => void;
};

/**
 * Web .pab-share (primary) / .pab-edit (secondary) on profiles; `compact` is the pill used in
 * people lists (.connect-btn).
 */
export function ProfileButton({ label, a11y, kind, compact = false, onPress }: ProfileButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !onPress }}
      hitSlop={touch.hitSlop}
      style={({ pressed }) => [
        compact ? styles.compact : styles.full,
        styles[kind],
        pressed && styles.pressed,
      ]}
    >
      <Text style={[compact ? styles.compactText : styles.fullText, styles[`${kind}Text`]]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  full: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compact: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullText: { fontFamily: fonts.bold, fontSize: 12 },
  compactText: { fontFamily: fonts.bold, fontSize: 11.5 },
  primary: { backgroundColor: colors.accent, boxShadow: '0 4px 16px rgba(255,0,80,0.14)' },
  primaryText: { color: colors.white },
  secondary: { backgroundColor: colors.bg3, borderWidth: 1.5, borderColor: colors.br2 },
  secondaryText: { color: colors.text },
  muted: { backgroundColor: colors.bg3, borderWidth: 1, borderColor: colors.br },
  mutedText: { color: colors.muted },
  pressed: { opacity: 0.8 },
});
