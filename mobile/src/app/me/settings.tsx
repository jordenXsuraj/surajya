import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, View } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { Badge, Button, Screen, Text } from '@/components/ui';
import { signOut, useLogoutAllDevices } from '@/hooks/useAccount';
import { appVersionLabel } from '@/lib/appVersion';
import { openWebPage, SUPPORT_EMAIL, webPages } from '@/lib/links';
import {
  pushPermission,
  registerForPush,
  requestPushPermission,
  type PushPermission,
} from '@/lib/push';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, radius, touch } from '@/theme/tokens';

// Settings (⚙ on Me): account (email, change email / password, log out everywhere), blocked
// users, notifications, legal pages, support, version, log out, delete account. Web: the
// AccountSettings block on Profile.jsx plus the footer links.
/** The notification permission, re-read when Settings comes into view or the app returns. */
function usePushPermissionState() {
  const [permission, setPermission] = useState<PushPermission | null>(null);
  const read = useCallback(() => {
    void pushPermission()
      .then(setPermission)
      .catch(() => undefined);
  }, []);
  useFocusEffect(
    useCallback(() => {
      read();
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') read();
      });
      return () => sub.remove();
    }, [read]),
  );
  return { permission, setPermission };
}

export default function SettingsScreen() {
  const user = useAuthStore((s) => s.user);
  const { mutate: logoutAll, isPending: loggingOutAll } = useLogoutAllDevices();
  const { permission, setPermission } = usePushPermissionState();

  if (!user) return null;

  const status = user.emailBounced ? 'bounced' : user.emailVerified ? 'verified' : 'unverified';

  function confirmLogout() {
    Alert.alert('Log out?', 'You can log back in any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  function confirmLogoutAll() {
    Alert.alert('Log out of all devices?', 'Log out of MeetNet on every other device?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out others', style: 'destructive', onPress: () => logoutAll() },
    ]);
  }

  async function emailSupport() {
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
    } catch {
      useUiStore.getState().showToast(`No email app found. Write to ${SUPPORT_EMAIL}`, 'info');
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
        <View style={styles.headerEnd} />
      </View>

      <Section title="Account">
        <View style={styles.emailRow}>
          <Text style={styles.rowLabel}>Email</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user.email}
          </Text>
          <View style={styles.badge}>
            {status === 'bounced' ? (
              <Badge label="📭 Bounced" color="yellow" tint="yl" />
            ) : status === 'verified' ? (
              <Badge label="✅ Verified" color="green" tint="gl" />
            ) : (
              <Badge label="Not verified" color="accent" tint="al" />
            )}
          </View>
        </View>
        {status === 'unverified' ? (
          <Row label="✅ Verify email" onPress={() => router.push('/verify-email')} />
        ) : null}
        <Row
          label="✉️ Change email"
          onPress={() => router.push({ pathname: '/verify-email', params: { change: '1' } })}
        />
        <Row label="🔑 Change password" onPress={() => router.push('/me/change-password')} />
        <Row
          label={loggingOutAll ? '📱 Logging out…' : '📱 Log out of all devices'}
          onPress={loggingOutAll ? undefined : confirmLogoutAll}
        />
      </Section>

      <Section title="Privacy & safety">
        <Row
          label="🚫 Blocked users"
          value={user.blockedIds.length ? String(user.blockedIds.length) : undefined}
          onPress={() => router.push('/me/blocked')}
        />
      </Section>

      <Section title="Notifications">
        {permission && !permission.granted ? (
          <Row
            label="🔕 Turn on notifications"
            hint="Follow requests, likes, replies and interest in your posts"
            onPress={async () => {
              if (!permission.canAskAgain) return void Linking.openSettings();
              const next = await requestPushPermission().catch(() => null);
              if (next) setPermission(next);
              if (next?.granted) void registerForPush({ force: true }).catch(() => undefined);
            }}
          />
        ) : null}
        <Row
          label="🔔 Notification settings"
          hint="Opens your phone's settings for MeetNet"
          onPress={() => void Linking.openSettings()}
        />
      </Section>

      <Section title="Legal">
        <Row label="Terms of Service" onPress={() => void openWebPage(webPages.terms)} />
        <Row label="Privacy Policy" onPress={() => void openWebPage(webPages.privacy)} />
        <Row
          label="Community Guidelines"
          onPress={() => void openWebPage(webPages.communityGuidelines)}
        />
      </Section>

      <Section title="Support">
        <Row label="✉️ Email support" hint={SUPPORT_EMAIL} onPress={() => void emailSupport()} />
      </Section>

      <Text style={styles.version}>{appVersionLabel()}</Text>

      <Button title="Log out" variant="secondary" onPress={confirmLogout} style={styles.logout} />
      <Row
        label="🗑️ Delete account"
        danger
        onPress={() => void openWebPage(webPages.deleteAccount)}
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title.toUpperCase()}
      </Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

type RowProps = {
  label: string;
  hint?: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
};

function Row({ label, hint, value, danger = false, onPress }: RowProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, danger && styles.danger]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  headerEnd: { width: 52 },
  section: { marginTop: 18 },
  sectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.7,
    color: colors.dim,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  emailRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  email: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  badge: { flexDirection: 'row', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: touch.min + 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  pressed: { backgroundColor: colors.bg3 },
  rowText: { flex: 1 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  rowHint: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.dim, marginTop: 2 },
  rowValue: { fontFamily: fonts.bold, fontSize: 13, color: colors.muted },
  chevron: { fontFamily: fonts.bold, fontSize: 18, color: colors.dim },
  danger: { color: colors.accent },
  version: {
    textAlign: 'center',
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.dim,
    marginTop: 22,
    marginBottom: 12,
  },
  logout: { marginBottom: 10 },
});
