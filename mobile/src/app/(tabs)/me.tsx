import { router, useScrollToTop } from 'expo-router';
import { useRef } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Badge, Button, Card, Text } from '@/components/ui';
import { useMe } from '@/hooks/useMe';
import { useTabReselect } from '@/hooks/useTabReselect';
import { needsEmailAttention } from '@/lib/sessionUser';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';

// Me — the full profile arrives in a later prompt. For now: who is signed in, email status, log out.
export default function MeScreen() {
  const user = useAuthStore((s) => s.user);
  const me = useMe();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  useTabReselect(() => void me.refetch());

  if (!user) return null;

  function confirmLogout() {
    Alert.alert('Log out?', 'You can log back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: () => useAuthStore.getState().logout(),
      },
    ]);
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
      refreshControl={
        <RefreshControl
          refreshing={me.isRefetching}
          onRefresh={() => void me.refetch()}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg3}
        />
      }
    >
      <View style={styles.profile}>
        <Avatar name={user.name} uri={user.avatar || null} size={72} />
        <Text variant="title" align="center">
          {decodeEntities(user.name)}
        </Text>
        <Text variant="caption" align="center">
          {[decodeEntities(user.college), `${user.year} year`, user.branch].join(' · ')}
        </Text>
        <View style={styles.counts}>
          <Text variant="caption">
            <Text style={styles.count}>{user.followerCount}</Text> followers
          </Text>
          <Text variant="caption">
            <Text style={styles.count}>{user.followingCount}</Text> following
          </Text>
        </View>
      </View>

      <Card>
        <Text variant="label" style={styles.cardTitle}>
          EMAIL
        </Text>
        <Text style={styles.email}>{user.email}</Text>
        <View style={styles.badgeRow}>
          {user.emailBounced ? (
            <Badge label="📭 Bounced" color="yellow" tint="yl" />
          ) : user.emailVerified ? (
            <Badge label="✅ Verified" color="green" tint="gl" />
          ) : (
            <Badge label="Not verified" color="accent" tint="al" />
          )}
        </View>
        {needsEmailAttention(user) && (
          <Button
            title={user.emailBounced ? 'Update email →' : 'Verify email →'}
            variant="secondary"
            onPress={() =>
              router.push(
                user.emailBounced
                  ? { pathname: '/verify-email', params: { change: '1' } }
                  : '/verify-email',
              )
            }
            style={styles.cardButton}
          />
        )}
      </Card>

      {__DEV__ && (
        <Card>
          <Text variant="label" style={styles.cardTitle}>
            DEVELOPER
          </Text>
          <Pressable
            onPress={() =>
              useUiStore
                .getState()
                .showVerifySheet(
                  'Please verify your email address first. We sent a 6-digit code to your inbox.',
                )
            }
            style={styles.devRow}
            accessibilityRole="button"
          >
            <Text style={styles.devText}>Test verify sheet</Text>
            <Text variant="caption">›</Text>
          </Pressable>
          <Pressable
            onPress={() => useUiStore.getState().showToast('Toast test — tap to dismiss')}
            style={styles.devRow}
            accessibilityRole="button"
          >
            <Text style={styles.devText}>Test toast</Text>
            <Text variant="caption">›</Text>
          </Pressable>
        </Card>
      )}

      <Button title="Log out" variant="secondary" onPress={confirmLogout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: 32 },
  profile: { alignItems: 'center', gap: 6, paddingBottom: 4 },
  counts: { flexDirection: 'row', gap: 18, marginTop: 4 },
  count: { fontFamily: fonts.bold, color: colors.text },
  cardTitle: { fontSize: 11.5, letterSpacing: 0.7, color: colors.dim, marginBottom: 8 },
  email: { fontFamily: fonts.medium, fontSize: 14, color: colors.text, marginBottom: 10 },
  badgeRow: { flexDirection: 'row' },
  cardButton: { marginTop: 14 },
  devRow: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.br,
  },
  devText: { fontFamily: fonts.regular, fontSize: 14, color: colors.text },
});
