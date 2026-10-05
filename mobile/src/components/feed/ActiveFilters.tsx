import { Pressable, StyleSheet, View } from 'react-native';

import type { FeedType } from '@/api/queryKeys';
import { Text } from '@/components/ui/Text';
import { FEED_CATEGORIES } from '@/lib/postTypes';
import { colors, fonts, touch } from '@/theme/tokens';

import type { HomeScope } from './CategoryBar';

type ActiveFiltersProps = {
  scope: HomeScope;
  category: FeedType;
  defaultScope: HomeScope;
  onClear: () => void;
};

// The web's (currently commented-out) .active-filter-bar: pills for what is filtered + "Clear ✕".
// Shown only when something differs from the default view.
export function ActiveFilters({ scope, category, defaultScope, onClear }: ActiveFiltersProps) {
  if (scope === defaultScope && category === 'all') return null;
  const categoryLabel = FEED_CATEGORIES.find((c) => c.id === category)?.label;
  return (
    <View style={styles.bar}>
      {scope !== defaultScope ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>
            {scope === 'global' ? '🌐 All colleges' : '🏫 My college'}
          </Text>
        </View>
      ) : null}
      {categoryLabel ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{categoryLabel}</Text>
        </View>
      ) : null}
      <Pressable
        onPress={onClear}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        style={styles.clear}
      >
        <Text style={styles.clearText}>Clear ✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  pill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.bg3,
  },
  pillText: { fontFamily: fonts.semibold, fontSize: 11.2, color: colors.text },
  clear: { marginLeft: 'auto', paddingVertical: 3, paddingHorizontal: 6 },
  clearText: { fontFamily: fonts.bold, fontSize: 11.2, color: colors.accent },
});
