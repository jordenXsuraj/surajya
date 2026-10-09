import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View, type TextInput } from 'react-native';

import { errorMessage } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { Button, Input, Message, Screen, Text } from '@/components/ui';
import { useChangePassword } from '@/hooks/useAccount';
import { openWebPage, webPages } from '@/lib/links';
import { changePasswordSchema, firstError, type ChangePasswordValues } from '@/lib/validation';
import { colors, fonts } from '@/theme/tokens';

// Web AccountSettings "🔑 Change password": current, new (min 8), repeat. Other devices are
// logged out; this one continues with the new token.
export default function ChangePasswordScreen() {
  const {
    control,
    handleSubmit,
    // destructured here, not read off formState later: the React Compiler would keep a stale value
    formState: { errors },
  } = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { current: '', next: '', repeat: '' },
  });
  const { mutate, isPending } = useChangePassword();
  const nextRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);
  // The server's answer is kept here, not with setError: react-hook-form changes its errors object
  // in place, so the React Compiler would go on showing the old (empty) message
  const [serverError, setServerError] = useState<{
    field: 'current' | 'next';
    message: string;
  } | null>(null);

  const submit = handleSubmit((values) => {
    setServerError(null);
    mutate(
      { current: values.current, next: values.next },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          const message = errorMessage(error, 'Could not change password');
          // 'Current password is incorrect' belongs to the first box; the rest to the new one
          setServerError({
            field: /^current password/i.test(message) ? 'current' : 'next',
            message,
          });
        },
      },
    );
  });

  const error = firstError(errors) ?? serverError?.message;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          Change password
        </Text>
        <View style={styles.headerEnd} />
      </View>

      <View style={styles.form}>
        <Controller
          control={control}
          name="current"
          render={({ field }) => (
            <Input
              placeholder="Current password"
              password
              value={field.value}
              onChangeText={field.onChange}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nextRef.current?.focus()}
              autoComplete="current-password"
              invalid={Boolean(errors.current) || serverError?.field === 'current'}
            />
          )}
        />
        <Controller
          control={control}
          name="next"
          render={({ field }) => (
            <Input
              ref={nextRef}
              placeholder="New password (min 8)"
              password
              value={field.value}
              onChangeText={field.onChange}
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => repeatRef.current?.focus()}
              autoComplete="new-password"
              invalid={Boolean(errors.next) || serverError?.field === 'next'}
            />
          )}
        />
        <Controller
          control={control}
          name="repeat"
          render={({ field }) => (
            <Input
              ref={repeatRef}
              placeholder="Repeat new password"
              password
              value={field.value}
              onChangeText={field.onChange}
              returnKeyType="done"
              onSubmitEditing={() => void submit()}
              autoComplete="new-password"
              invalid={Boolean(errors.repeat)}
            />
          )}
        />
        <Message text={error ?? ''} />
        <Text variant="note">This logs you out on your other devices.</Text>
        <Button
          title="Change password"
          testID="change-password-submit"
          loadingTitle="Saving…"
          loading={isPending}
          onPress={() => void submit()}
        />
        <Button
          title="Forgot your current password?"
          variant="link"
          onPress={() => void openWebPage(webPages.forgotPassword)}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  headerEnd: { width: 52 },
  form: { gap: 12, marginTop: 16 },
});
