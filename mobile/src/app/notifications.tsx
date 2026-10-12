import { useIsFocused } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { NotificationList } from '@/components/notifications/NotificationList';
import { Text } from '@/components/ui';
import { colors, fonts, layout } from '@/theme/tokens';

// From the Home bell (and pushes without a better target). Opening it marks everything read.
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          Notifications
        </Text>
        <View style={styles.topBarEnd} />
      </View>
      <NotificationList active={focused} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  topBarEnd: { width: 52 },
});
