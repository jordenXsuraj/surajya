import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Screen, Text } from '@/components/ui';
import { logPushFailure, registerForPush, requestPushPermission } from '@/lib/push';
import { colors, fonts } from '@/theme/tokens';

const REASONS = [
  { emoji: '🤝', text: 'Someone asks to follow you, or accepts your request' },
  { emoji: '💬', text: 'Someone replies to or likes your post' },
  { emoji: '🙋', text: 'A student is interested in your post' },
];

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

// Soft pre-prompt before the system permission dialog (Android 13+ POST_NOTIFICATIONS, iOS):
// the system dialog can only be shown a couple of times, so it comes after a clear "yes" here.
// "Not now" asks again after 14 days (src/lib/push.ts).
export default function PushPromptScreen() {
  const [asking, setAsking] = useState(false);

  async function turnOn() {
    setAsking(true);
    try {
      const permission = await requestPushPermission();
      // Registration (FCM token, Expo, our API) can take a while right after a boot: it runs in
      // the background, the prompt closes as soon as the system answered. Offline or a server
      // error right now: it tries again by itself (src/lib/push.ts)
      if (permission.granted) void registerForPush({ force: true }).catch(logPushFailure);
    } finally {
      setAsking(false);
      close();
    }
  }

  return (
    <Screen>
      <View style={styles.body}>
        <Text style={styles.bell}>🔔</Text>
        <Text variant="title" align="center" accessibilityRole="header">
          Turn on notifications?
        </Text>
        <Text variant="caption" align="center">
          Know right away when it matters. You can change this any time in Settings.
        </Text>
        <View style={styles.reasons}>
          {REASONS.map((r) => (
            <View key={r.emoji} style={styles.reason}>
              <Text style={styles.reasonEmoji}>{r.emoji}</Text>
              <Text style={styles.reasonText}>{r.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          title="Turn on notifications"
          loading={asking}
          loadingTitle="Asking…"
          onPress={() => void turnOn()}
        />
        <Button title="Not now" variant="ghost" onPress={close} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 14 },
  bell: { fontSize: 56, lineHeight: 70, textAlign: 'center' },
  reasons: {
    gap: 12,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reasonEmoji: { fontSize: 20 },
  reasonText: { flex: 1, fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, color: colors.text },
  actions: { gap: 8, paddingBottom: 12 },
});
