import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Activity } from '@/components/connect/Activity';
import { FindPeople } from '@/components/connect/FindPeople';
import { SegmentedTabs } from '@/components/connect/SegmentedTabs';
import { SuggestedPeople } from '@/components/connect/SuggestedPeople';
import { Text } from '@/components/ui';
import { useActivityCounts } from '@/hooks/useUnreadCount';
import { colors, layout } from '@/theme/tokens';

type ConnectTab = 'find' | 'suggested' | 'activity';

const TITLES: Record<ConnectTab, string> = {
  find: 'Find People 🔍',
  suggested: 'Suggested 💡',
  activity: 'Activity 🔔',
};

// Port of the web's Connect.jsx: Find / Suggested / Activity. Re-tapping the Connect tab scrolls
// the open list to the top and refreshes it.
export default function ConnectScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ConnectTab>('find');
  const activity = useActivityCounts().total;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text variant="title" accessibilityRole="header">
          {TITLES[tab]}
        </Text>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          segments={[
            { key: 'find', label: 'Find' },
            { key: 'suggested', label: 'Suggested' },
            { key: 'activity', label: 'Activity', badge: activity },
          ]}
        />
      </View>
      {tab === 'find' ? <FindPeople /> : tab === 'suggested' ? <SuggestedPeople /> : <Activity />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    gap: 10,
    paddingHorizontal: layout.gutter,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
});
