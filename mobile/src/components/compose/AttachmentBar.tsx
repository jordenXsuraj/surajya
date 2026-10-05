import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, touch } from '@/theme/tokens';

export type AttachmentKind = 'photo' | 'youtube' | 'pdf' | 'link' | 'tags';

type Item = { kind: AttachmentKind; label: string; active: boolean; disabled?: boolean };

type AttachmentBarProps = {
  items: Item[];
  onPress: (kind: AttachmentKind) => void;
};

// The web's "+" menu as a row of chips (Photo, YouTube, PDF, Link, Tags).
// A chip is highlighted while that attachment has something in it.
export function AttachmentBar({ items, onPress }: AttachmentBarProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {items.map((item) => (
        <Pressable
          key={item.kind}
          onPress={() => onPress(item.kind)}
          disabled={item.disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: item.active, disabled: item.disabled }}
          style={({ pressed }) => [
            styles.chip,
            item.active && styles.active,
            item.disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.text, item.active && styles.activeText]}>{item.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingVertical: 4 },
  chip: {
    minHeight: touch.min - 6,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.actBorder,
    backgroundColor: '#1a1a1a',
  },
  active: { borderColor: colors.accent, backgroundColor: colors.al },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
  text: { fontFamily: fonts.semibold, fontSize: 12, color: '#dddddd' },
  activeText: { color: colors.text },
});
