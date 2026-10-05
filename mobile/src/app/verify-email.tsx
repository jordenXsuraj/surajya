import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { sendVerification, verifyEmail } from '@/api/endpoints/auth';
import { ApiError, errorMessage } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { BackButton } from '@/components/BackButton';
import { ChangeEmailForm } from '@/components/ChangeEmailForm';
import { CodeInput, EMPTY_CODE } from '@/components/CodeInput';
import { Button, Card, Message, Screen, Text } from '@/components/ui';
import { formatCountdown, useResendCountdown } from '@/hooks/useResendCountdown';
import { toSessionUser } from '@/lib/sessionUser';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, touch } from '@/theme/tokens';

// Port of nexusnetwork/src/pages/VerifyEmail.jsx (copy and behaviour).

function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ change?: string }>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const left = useResendCountdown();

  const [digits, setDigits] = useState<string[]>([...EMPTY_CODE]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [changing, setChanging] = useState(params.change === '1');
  const [done, setDone] = useState(false);
  const [focusKey, setFocusKey] = useState(0);

  const verify = useMutation({
    mutationFn: verifyEmail,
    onSuccess: (data) => {
      useAuthStore.getState().setUser(toSessionUser(data.user));
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      setDone(true);
    },
    onError: (e) => {
      setError(errorMessage(e, 'Could not verify. Please try again.'));
      if (e instanceof ApiError && (e.code === 'CODE_LOCKED' || e.code === 'CODE_EXPIRED')) {
        setDigits([...EMPTY_CODE]);
      }
      setFocusKey((k) => k + 1);
    },
  });

  const resend = useMutation({
    mutationFn: sendVerification,
    onSuccess: (data) => {
      useAuthStore.getState().markCodeSent();
      setDigits([...EMPTY_CODE]);
      setInfo(data.message || 'We sent a new code.');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'ALREADY_VERIFIED') {
        useAuthStore.getState().updateUser({ emailVerified: true, verificationRequired: false });
        setDone(true);
        return;
      }
      if (e instanceof ApiError && e.retryAfterSeconds) {
        useAuthStore.getState().setResendWait(e.retryAfterSeconds);
      }
      setError(errorMessage(e, 'Could not send a new code.'));
    },
  });

  function submit(code: string) {
    if (verify.isPending || code.length !== 6) return;
    setError('');
    setInfo('');
    verify.mutate(code);
  }

  function requestCode() {
    if (left > 0 || resend.isPending) return;
    setError('');
    setInfo('');
    resend.mutate();
  }

  if (done || (user?.emailVerified && !user.emailBounced && !changing)) {
    return (
      <Screen scroll>
        <Text variant="heading" style={styles.h1}>
          Email verified
        </Text>
        <Card>
          <Message
            type="success"
            text={`✅ ${user?.email ?? 'Your email'} is verified. You can now post, reply and follow people, and reset your password by email if you ever need to.`}
          />
          <Button title="Continue to MeetNet →" onPress={leave} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BackButton />
      <Text variant="heading" style={styles.h1}>
        Verify your email
      </Text>
      <Text variant="body">
        We sent a 6-digit code to <Text style={styles.email}>{user?.email}</Text>. It expires in 10
        minutes.
      </Text>

      {!changing && (
        <Card>
          <CodeInput
            digits={digits}
            onChange={(next) => {
              setDigits(next);
              setError('');
            }}
            onComplete={submit}
            disabled={verify.isPending}
            focusKey={focusKey}
          />
          <Message text={error} />
          <Message type="success" text={info} />
          <Button
            title="Verify"
            loadingTitle="Checking…"
            loading={verify.isPending}
            disabled={digits.some((d) => !d)}
            onPress={() => submit(digits.join(''))}
          />
          <Pressable
            onPress={requestCode}
            disabled={left > 0 || resend.isPending}
            accessibilityRole="button"
            accessibilityState={{ disabled: left > 0 }}
            style={styles.resend}
          >
            <Text style={[styles.resendText, left === 0 && styles.resendActive]}>
              {left > 0
                ? `Resend code in ${formatCountdown(left)}`
                : resend.isPending
                  ? 'Sending…'
                  : 'Resend code'}
            </Text>
          </Pressable>
          <Text variant="note" align="center">
            Can't find it? Check your spam folder.
          </Text>
        </Card>
      )}

      <Card style={changing ? undefined : styles.compactCard}>
        {changing ? (
          <>
            <Text style={styles.h2}>Change your email</Text>
            <ChangeEmailForm
              submitLabel="Change email and send code"
              onDone={() => {
                setChanging(false);
                setDigits([...EMPTY_CODE]);
                setError('');
                setInfo('We sent a code to your new address.');
              }}
            />
            <Button title="Cancel" variant="ghost" onPress={() => setChanging(false)} />
          </>
        ) : (
          <Text variant="body" style={styles.noMargin}>
            Wrong email?{' '}
            <Text style={styles.link} onPress={() => setChanging(true)} accessibilityRole="link">
              Change it
            </Text>
          </Text>
        )}
      </Card>

      <Text variant="body" style={styles.footer}>
        <Text style={styles.link} onPress={leave} accessibilityRole="link">
          Skip for now
        </Text>
        {user?.verificationRequired
          ? " — you can browse, but you'll need to verify before posting, replying or following."
          : ' — verifying lets you reset your password by email.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { marginTop: 8, marginBottom: 6 },
  h2: { fontFamily: fonts.bold, fontSize: 16, color: colors.text, marginBottom: 12 },
  email: { fontFamily: fonts.bold, color: colors.text },
  resend: { minHeight: touch.min, alignItems: 'center', justifyContent: 'center' },
  resendText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.dim },
  resendActive: { color: colors.muted, fontFamily: fonts.semibold },
  compactCard: { marginTop: 0 },
  noMargin: { margin: 0 },
  link: { color: colors.blue, fontFamily: fonts.semibold },
  footer: { marginBottom: 24 },
});
