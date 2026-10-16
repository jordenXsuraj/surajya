import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, fonts, touch } from '@/theme/tokens';

export type Segment<K extends string> = {
  key: K;
  label: string;
  /** Red count pill (hidden while this segment is selected, like the web). */
  badge?: number;
};

type SegmentedTabsProps<K extends string> = {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  /** solid: the web's Activity sub-tabs (accent fill); outline: .view-toggle. */
  look?: 'outline' | 'solid';
};

// Web Connect .view-toggle (Find / Suggested / Activity) and the Activity sub-tab buttons.
export function SegmentedTabs<K extends string>({
  segments,
  value,
  onChange,
  look = 'outline',
}: SegmentedTabsProps<K>) {
  return (
    <View style={[styles.row, look === 'outline' && styles.outlineRow]} accessibilityRole="tablist">
      {segments.map((segment) => {
        const selected = segment.key === value;
        const badge = !selected && segment.badge ? segment.badge : 0;
        return (
          <Pressable
            key={segment.key}
            onPress={() => {
              if (selected) return;
              onChange(segment.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={badge ? `${segment.label}, ${badge} new` : segment.label}
            style={[
              styles.segment,
              look === 'solid' ? styles.solid : styles.outline,
              selected && (look === 'solid' ? styles.solidOn : styles.outlineOn),
            ]}
          >
            <Text
              style={[
                styles.text,
                selected && (look === 'solid' ? styles.solidText : styles.outlineText),
              ]}
              maxFontSizeMultiplier={1.3}
            >
              {segment.label}
            </Text>
            {badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} maxFontSizeMultiplier={1.1}>
                  {badge > 99 ? '99+' : badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  outlineRow: {
    gap: 4,
    padding: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.bg3,
  },
  segment: {
    flex: 1,
    minHeight: touch.min - 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  outline: {},
  outlineOn: { backgroundColor: colors.al },
  solid: { backgroundColor: colors.bg3 },
  solidOn: { backgroundColor: colors.accent },
  text: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.muted },
  outlineText: { color: colors.accentText },
  solidText: { color: colors.white },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white, lineHeight: 12 },
});
