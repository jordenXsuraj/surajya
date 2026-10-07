import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts } from '@/theme/tokens';

type ToggleRowProps = {
  icon?: string;
  label: string;
  sub: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Track colour when on (web: accent for anonymous, orange for Today Only). */
  tint?: string;
};

// .anon-row: label + sub on the left, switch on the right; the whole row toggles.
export function ToggleRow({
  icon,
  label,
  sub,
  value,
  onChange,
  tint = colors.accent,
}: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={`${label}. ${sub}`}
      style={[styles.row, value && { borderColor: tint }]}
    >
      <View style={styles.left}>
        {icon ? <Text style={styles.icon}>{icon}</Text> : null}
        <View style={styles.texts}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.sub}>{sub}</Text>
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.bg3, true: tint }}
        thumbColor={colors.white}
        ios_backgroundColor={colors.bg3}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.bg2,
    minHeight: 56,
  },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 18 },
  texts: { flex: 1 },
  label: { fontFamily: fonts.bold, fontSize: 13.1, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 11.2, color: colors.dim, marginTop: 2 },
});
