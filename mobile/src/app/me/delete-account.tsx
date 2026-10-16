import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { Button, Input, Message, Screen, Text } from '@/components/ui';
import { useDeleteAccount } from '@/hooks/useAccount';
import { openWebPage, webPages } from '@/lib/links';
import { colors, fonts, radius } from '@/theme/tokens';

// What DELETE /users/me removes (server/services/accountDeletion.js), in the user's words.
const DELETED = [
  'Your profile, profile photo and cover',
  'All your posts, including anonymous posts and confessions',
  'Your replies and likes',
  'Your followers, following, follow requests and blocks',
  'Your saved posts, notifications and reports',
  'Push notifications to all your devices',
] as const;

// Settings → Delete account (Apple 5.1.1(v), Google Play): what gets deleted, the password, a
// final confirmation, then DELETE /users/me and back to the welcome screen.
export default function DeleteAccountScreen() {
  const [password, setPassword] = useState('');
  const { mutate, isPending, error, reset } = useDeleteAccount();

  function confirm() {
    if (!password) return;
    Alert.alert(
      'Delete your account?',
      'Your account and everything listed here are deleted for good. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          // a wrong password is cleared, so the next try starts from an empty box
          onPress: () => mutate(password, { onError: () => setPassword('') }),
        },
      ],
    );
  }

  return (
    <Screen
      scroll
      footer={
        <Button
          title="Delete my account"
          loadingTitle="Deleting…"
          loading={isPending}
          disabled={!password}
          onPress={confirm}
          testID="delete-account-submit"
        />
      }
    >
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          Delete account
        </Text>
        <View style={styles.headerEnd} />
      </View>

      <Text variant="body" style={styles.lead}>
        This permanently deletes your MeetNet account. It cannot be undone.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>What gets deleted</Text>
        {DELETED.map((item) => (
          <Text key={item} style={styles.item}>
            • {item}
          </Text>
        ))}
      </View>

      <Input
        placeholder="Your password"
        password
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (error) reset();
        }}
        returnKeyType="done"
        onSubmitEditing={confirm}
        autoComplete="current-password"
        accessibilityLabel="Your password, to confirm"
        invalid={Boolean(error)}
        testID="delete-account-password"
      />
      <Message text={error ? errorMessage(error, 'Could not delete your account') : ''} />

      <Button
        title="Forgot your password?"
        variant="link"
        onPress={() => void openWebPage(webPages.forgotPassword)}
      />
      <Text variant="note" style={styles.web}>
        You can also delete your account on the web at themeetnet.com/delete-account, also when you
        can't log in.
      </Text>
      <Button
        title="Open themeetnet.com/delete-account"
        variant="link"
        onPress={() => void openWebPage(webPages.deleteAccount)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  headerEnd: { width: 52 },
  lead: { marginTop: 16, marginBottom: 14, color: colors.text },
  card: {
    padding: 14,
    marginBottom: 16,
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.bg2,
  },
  cardTitle: { fontFamily: fonts.bold, fontSize: 13.6, color: colors.text, marginBottom: 2 },
  item: { fontFamily: fonts.regular, fontSize: 13.1, lineHeight: 19, color: colors.muted },
  web: { marginTop: 8, textAlign: 'center' },
});
