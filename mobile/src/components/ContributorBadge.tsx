import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';

/** Web ContributorBadge: a small orange ★ circle after the name ("Top Contributor"). */
export function ContributorBadge({ size = 18 }: { size?: number }) {
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}
      accessibilityLabel="Top Contributor"
    >
      <Text style={[styles.star, { fontSize: size * 0.61, lineHeight: size * 0.72 }]}>★</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.contributor,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.contributor}, ${colors.contributorEnd})`,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
  },
  star: { color: colors.white },
});
