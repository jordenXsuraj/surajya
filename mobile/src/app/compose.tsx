import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Screen, Text } from '@/components/ui';
import { POST_TYPES } from '@/lib/postTypes';
import { colors, fonts, radius, touch } from '@/theme/tokens';

// Compose modal (raised Post button). Posting arrives in Prompt 3; the type list already uses the
// final copy from Post.jsx (with the web's typos fixed).
export default function ComposeScreen() {
  return (
    <Screen scroll edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text variant="title">Create a post</Text>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      <Text variant="caption" style={styles.sub}>
        Posting comes in the next update. These are the post types you'll pick from:
      </Text>
      <View style={styles.grid}>
        {POST_TYPES.map((t) => (
          <View key={t.id} style={[styles.type, { borderColor: colors[t.tint] }]}>
            <Text style={styles.em}>{t.em}</Text>
            <Text style={[styles.name, { color: colors[t.color] }]}>{t.label}</Text>
            <Text variant="note" style={styles.desc}>
              {t.desc}
            </Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  close: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: colors.muted },
  sub: { marginTop: 6, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  type: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.bg3,
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: 12,
    gap: 3,
  },
  em: { fontSize: 20 },
  name: { fontFamily: fonts.bold, fontSize: 13.6 },
  desc: { lineHeight: 15 },
});
