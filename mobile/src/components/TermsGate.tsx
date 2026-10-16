import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { useBlockBack } from '@/components/AppGate';
import { Logo } from '@/components/Logo';
import { TermsCheckbox } from '@/components/TermsCheckbox';
import { Button, Message, Screen, Text } from '@/components/ui';
import { signOut, useAcceptTerms } from '@/hooks/useAccount';
import { openWebPage, webPages } from '@/lib/links';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, radius, touch } from '@/theme/tokens';

/**
 * True while the signed-in user has never accepted the terms: accounts created before the terms
 * existed (signup records the date). GET /users/me refreshes `termsAcceptedAt` on every start.
 */
export function useNeedsTerms(): boolean {
  return useAuthStore((s) => s.status === 'signedIn' && !!s.user && !s.user.termsAcceptedAt);
}

const DOCUMENTS = [
  { label: 'Terms of Service', url: webPages.terms },
  { label: 'Privacy Policy', url: webPages.privacy },
  { label: 'Community Guidelines', url: webPages.communityGuidelines },
] as const;

// Blocking screen above the whole app (App Store guideline 1.2: users agree to terms that leave
// no room for objectionable content or abusive users). Android back does nothing; the only ways
// on are "Agree and continue" (POST /users/me/accept-terms) or "Log out".
export function AcceptTermsScreen() {
  const [checked, setChecked] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const accept = useAcceptTerms();
  useBlockBack();

  return (
    <Screen
      scroll
      footer={
        <View style={styles.footer}>
          <Button
            title="Agree and continue"
            loadingTitle="Saving…"
            loading={accept.isPending}
            disabled={!checked || leaving}
            onPress={() => accept.mutate()}
          />
          <Button
            title="Log out"
            variant="ghost"
            loading={leaving}
            loadingTitle="Logging out…"
            disabled={accept.isPending}
            onPress={() => {
              setLeaving(true);
              void signOut();
            }}
          />
        </View>
      }
    >
      <View style={styles.logo}>
        <Logo size="sm" />
      </View>
      <Text variant="title" accessibilityRole="header">
        Before you continue
      </Text>
      <Text variant="caption" style={styles.intro}>
        To keep using MeetNet, please read and accept our terms. MeetNet has no tolerance for
        objectionable content or abusive users: posts, replies and accounts that break the rules are
        removed.
      </Text>
      <View style={styles.docs}>
        {DOCUMENTS.map((doc) => (
          <Pressable
            key={doc.url}
            onPress={() => void openWebPage(doc.url)}
            accessibilityRole="link"
            accessibilityLabel={`Read the ${doc.label}`}
            style={({ pressed }) => [styles.doc, pressed && styles.pressed]}
          >
            <Text style={styles.docText}>📄 {doc.label}</Text>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        ))}
      </View>
      <TermsCheckbox checked={checked} onChange={setChecked} />
      {accept.isError ? (
        <Message text={errorMessage(accept.error, 'Could not save. Please try again.')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', marginTop: 24, marginBottom: 20 },
  intro: { marginTop: 8, marginBottom: 18, color: colors.muted, fontFamily: fonts.regular },
  docs: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.bg2,
    marginBottom: 18,
  },
  doc: {
    minHeight: touch.min + 4,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  pressed: { opacity: 0.6 },
  docText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
  arrow: { fontFamily: fonts.bold, fontSize: 18, color: colors.muted },
  footer: { gap: 4, paddingTop: 8 },
});
