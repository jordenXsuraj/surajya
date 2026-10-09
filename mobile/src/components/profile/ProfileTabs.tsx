import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, touch } from '@/theme/tokens';

export type ProfileTab = 'posts' | 'media' | 'saved';

type ProfileTabsProps = {
  tabs: { key: ProfileTab; label: string }[];
  current: ProfileTab;
  onChange: (tab: ProfileTab) => void;
};

/** Web .posts-tabs: "Posts (n)" / "Media 🎬 (n)" / "🔖 Saved (n)" with an accent underline. */
export function ProfileTabs({ tabs, current, onChange }: ProfileTabsProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {tabs.map((t) => {
        const on = t.key === current;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.tab, on && styles.tabOn]}
          >
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  tab: {
    flex: 1,
    minHeight: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabOn: { borderBottomColor: colors.accent },
  text: { fontFamily: fonts.bold, fontSize: 14, color: colors.dim },
  textOn: { color: colors.text },
});
