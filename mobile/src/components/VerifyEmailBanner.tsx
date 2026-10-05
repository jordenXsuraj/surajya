import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { needsEmailAttention } from '@/lib/sessionUser';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, touch } from '@/theme/tokens';

// Port of VerifyEmailBanner.jsx: soft reminder while the email is unverified or bounced.
// ✕ hides it until the app is restarted (web: per browser session).
export function VerifyEmailBanner() {
  const user = useAuthStore((s) => s.user);
  const dismissed = useUiStore((s) => s.verifyBannerDismissed);
  const dismiss = useUiStore((s) => s.dismissVerifyBanner);

  if (dismissed || !user || !needsEmailAttention(user)) return null;

  const bounced = user.emailBounced;
  const open = () =>
    router.push(bounced ? { pathname: '/verify-email', params: { change: '1' } } : '/verify-email');

  return (
    <View style={styles.banner} accessibilityRole="summary" accessibilityLabel="Email verification">
      <Text style={styles.text}>
        {bounced
          ? '📭 Your email bounced — please update it. '
          : '✉️ Verify your email so you can reset your password. '}
        <Text style={styles.link} onPress={open} accessibilityRole="link">
          {bounced ? 'Update email →' : 'Verify now →'}
        </Text>
      </Text>
      <Pressable
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss until the app restarts"
        style={styles.close}
      >
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // .sec-notice.verify-banner
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: colors.bl,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(59,130,246,0.25)',
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 4,
  },
  text: {
    flex: 1,
    paddingTop: 2,
    fontFamily: fonts.regular,
    fontSize: 12.2,
    lineHeight: 18,
    color: colors.text,
  },
  link: { fontFamily: fonts.bold, color: colors.blue },
  close: {
    width: touch.min,
    height: touch.min,
    marginTop: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 15.2, color: colors.muted },
});
