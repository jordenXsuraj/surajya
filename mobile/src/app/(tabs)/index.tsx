import { StyleSheet, View } from 'react-native';

import { TabPlaceholder } from '@/components/TabPlaceholder';
import { Badge, Text } from '@/components/ui';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
import { useMe } from '@/hooks/useMe';
import { POST_TYPES } from '@/lib/postTypes';

// Home — the feed arrives in Prompt 3. The type tags below are the ones the feed cards will use.
export default function HomeScreen() {
  const me = useMe();

  return (
    <TabPlaceholder
      emoji="🏠"
      heading="Your campus feed"
      message="Posts from your college show up here in the next update."
      banner={<VerifyEmailBanner />}
      refreshing={me.isRefetching}
      onRefresh={() => void me.refetch()}
    >
      <Text variant="label" style={styles.label}>
        Post types
      </Text>
      <View style={styles.tags}>
        {POST_TYPES.map((t) => (
          <Badge key={t.id} label={t.tag} color={t.color} tint={t.tint} />
        ))}
      </View>
    </TabPlaceholder>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
