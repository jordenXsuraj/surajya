import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, fontSize, radius, touch } from '@/theme/tokens';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** Custom (user-added) skill: dashed border, like .sk-custom. */
  dashed?: boolean;
  /** Static rounded pill (.ob-chip) instead of a selectable chip (.sk-chip). */
  variant?: 'select' | 'pill';
  accessibilityLabel?: string;
};

export function Chip({
  label,
  selected = false,
  onPress,
  dashed = false,
  variant = 'select',
  accessibilityLabel,
}: ChipProps) {
  if (variant === 'pill' || !onPress) {
    return (
      <View style={[styles.pill, variant === 'select' && styles.select, selected && styles.on]}>
        <Text style={[styles.pillText, selected && styles.onText]}>{label}</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => [
        styles.select,
        selected && styles.on,
        dashed && styles.dashed,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.selectText, selected && styles.onText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // .ob-chip
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 13,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: radius.pill,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 11.7, color: colors.muted },
  // .sk-chip
  select: {
    minHeight: touch.min - 6,
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.bg3,
    borderWidth: 1.5,
    borderColor: colors.br,
    borderRadius: 10,
  },
  selectText: { fontFamily: fonts.semibold, fontSize: fontSize.sm, color: colors.muted },
  on: { backgroundColor: colors.al, borderColor: colors.accent },
  onText: { color: colors.accent },
  dashed: { borderStyle: 'dashed' },
  pressed: { opacity: 0.8 },
});
