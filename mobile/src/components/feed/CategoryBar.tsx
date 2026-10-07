import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { FeedType } from '@/api/queryKeys';
import { FEED_CATEGORIES } from '@/lib/postTypes';
import { colors, fonts, touch, type ColorName } from '@/theme/tokens';
import type { PostType } from '@/types/post';

export type HomeScope = 'global' | 'college';

export const SCOPE_LABELS: Record<HomeScope, string> = {
  global: '🌐 All',
  college: '🏫 My College',
};

type CategoryBarProps = {
  scope: HomeScope;
  onScope: (scope: HomeScope) => void;
  category: FeedType;
  onCategory: (category: FeedType) => void;
};

// .cat-row: scope select (🌐 All / 🏫 My College) · divider · category chips.
// Tapping the active chip goes back to all types, like the web.
export function CategoryBar({ scope, onScope, category, onCategory }: CategoryBarProps) {
  function pickScope() {
    Alert.alert('Show posts from', undefined, [
      { text: SCOPE_LABELS.global, onPress: () => onScope('global') },
      { text: SCOPE_LABELS.college, onPress: () => onScope('college') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <View style={styles.row}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Pressable
          onPress={pickScope}
          accessibilityRole="button"
          accessibilityLabel={`Showing ${scope === 'global' ? 'all colleges' : 'my college'}. Change`}
          style={styles.scope}
        >
          <Text style={styles.scopeText}>{SCOPE_LABELS[scope]} ▾</Text>
        </Pressable>
        <View style={styles.divider} />
        {FEED_CATEGORIES.map((c) => {
          const on = category === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => onCategory(on ? 'all' : c.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on && styles.chipOn, on && chipBorder[c.id]]}
            >
              <Text style={[styles.chipText, on && chipText[c.id]]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const byType = <T,>(make: (color: string) => T) =>
  Object.fromEntries(
    FEED_CATEGORIES.map((c) => [c.id, make(colors[c.color as ColorName])]),
  ) as Record<PostType, T>;

const chipBorder = StyleSheet.create(byType((color) => ({ borderColor: color })));
const chipText = StyleSheet.create(byType((color) => ({ color })));

const styles = StyleSheet.create({
  row: { borderBottomWidth: 1, borderBottomColor: colors.br, backgroundColor: colors.bg },
  scroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  scope: {
    minHeight: touch.min - 10,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.br2,
    backgroundColor: colors.bg3,
  },
  scopeText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.text },
  divider: { width: 1, height: 22, backgroundColor: colors.br2, marginHorizontal: 4 },
  chip: {
    minHeight: touch.min - 10,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.br,
  },
  chipOn: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipText: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.muted },
});
