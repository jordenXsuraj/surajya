import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { POST_TYPES } from '@/lib/postTypes';
import { colors, fonts, type ColorName } from '@/theme/tokens';
import type { PostType } from '@/types/post';

type TypeGridProps = {
  value: PostType;
  onChange: (type: PostType) => void;
  /** Remote switch: GET /app/config features.confessionsEnabled */
  confessionsEnabled: boolean;
};

// .post-type-grid: 3 columns, emoji · name · description; selected = type colour border + tint.
export function TypeGrid({ value, onChange, confessionsEnabled }: TypeGridProps) {
  const types = POST_TYPES.filter((t) => confessionsEnabled || t.id !== 'confession');
  return (
    <View
      style={styles.grid}
      accessibilityRole="radiogroup"
      accessibilityLabel="What are you sharing?"
    >
      {types.map((t) => {
        const on = value === t.id;
        return (
          <Pressable
            key={t.id}
            onPress={() => onChange(t.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${t.label}. ${t.desc}`}
            style={[styles.cell, on && styles.on, on && selected[t.id]]}
          >
            <Text style={styles.em}>{t.em}</Text>
            <Text style={styles.name}>{t.label}</Text>
            <Text style={styles.desc} numberOfLines={3}>
              {t.desc}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const selected = StyleSheet.create(
  Object.fromEntries(
    POST_TYPES.map((t) => [
      t.id,
      { borderColor: colors[t.color as ColorName], backgroundColor: colors[t.tint as ColorName] },
    ]),
  ) as Record<PostType, { borderColor: string; backgroundColor: string }>,
);

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  cell: {
    width: '31.5%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  on: { transform: [{ scale: 1.03 }], boxShadow: '0 6px 20px rgba(0,0,0,0.35)' },
  em: { fontSize: 22, lineHeight: 28 },
  name: { fontFamily: fonts.extrabold, fontSize: 11, color: colors.text, textAlign: 'center' },
  desc: {
    fontFamily: fonts.regular,
    fontSize: 9.6,
    lineHeight: 12.5,
    color: colors.dim,
    textAlign: 'center',
  },
});
