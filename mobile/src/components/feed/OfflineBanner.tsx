import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useIsOnline } from '@/lib/reactQueryNative';
import { colors, fonts } from '@/theme/tokens';

/**
 * Shown while NetInfo reports no connection, under the header of every screen that shows cached
 * data (feeds, Connect, Me, notifications, a post, a profile); what is cached stays on screen.
 */
export function OfflineBanner({ message = "📡 You're offline — showing saved posts" }) {
  const online = useIsOnline();
  if (online) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.yl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.25)',
  },
  text: { fontFamily: fonts.semibold, fontSize: 12, color: colors.yellow, textAlign: 'center' },
});
