import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, EmptyState, Screen } from '@/components/ui';

// A link to a screen the app doesn't have (an old or mistyped link).
export default function NotFoundScreen() {
  return (
    <Screen>
      <View style={styles.center}>
        <EmptyState
          emoji="🔗"
          title="This link isn't available"
          message="It may be old or mistyped. Everything else is one tap away."
        />
        <Button title="Go home" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', gap: 16 },
});
