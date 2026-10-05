import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, radius, type ColorName } from '@/theme/tokens';

type BadgeProps = {
  label: string;
  color?: ColorName;
  tint?: ColorName;
};

// .step-badge by default; coloured variants for type tags and status.
export function Badge({ label, color, tint }: BadgeProps) {
  const coloured = color && tint;
  return (
    <View
      style={[
        styles.badge,
        coloured && { backgroundColor: colors[tint], borderColor: 'transparent' },
      ]}
    >
      <Text style={[styles.text, coloured && { color: colors[color] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: radius.pill,
  },
  text: { fontFamily: fonts.bold, fontSize: 11.5, color: colors.muted },
});
