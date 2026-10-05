import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { login } from '@/api/endpoints/auth';
import { errorMessage } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { Logo } from '@/components/Logo';
import { Button, Input, Message, Screen, Text } from '@/components/ui';
import { openWebPage, webPages } from '@/lib/links';
import { toSessionUser } from '@/lib/sessionUser';
import { firstError, loginSchema, type LoginValues } from '@/lib/validation';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, touch } from '@/theme/tokens';

export default function LoginScreen() {
  const passwordRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    reValidateMode: 'onSubmit',
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) => login(values.email, values.password),
    // The guard swaps to the signed-in stack by itself.
    onSuccess: (data) => useAuthStore.getState().signIn(data.token, toSessionUser(data.user)),
  });

  const submit = handleSubmit((values) => {
    if (!mutation.isPending) mutation.mutate(values);
  });

  function edited() {
    clearErrors();
    if (mutation.error) mutation.reset();
  }

  const message = firstError(errors) ?? (mutation.error ? errorMessage(mutation.error) : undefined);

  return (
    <Screen scroll>
      <BackButton />
      <View style={styles.header}>
        <Logo size="sm" />
        <Text variant="heading" style={styles.title}>
          Welcome back
        </Text>
      </View>

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            placeholder="Enter your Email"
            value={field.value}
            onChangeText={(t) => {
              field.onChange(t);
              edited();
            }}
            onBlur={field.onBlur}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            invalid={Boolean(errors.email)}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input
            ref={passwordRef}
            placeholder="Password"
            value={field.value}
            onChangeText={(t) => {
              field.onChange(t);
              edited();
            }}
            onBlur={field.onBlur}
            password
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={submit}
            invalid={Boolean(errors.password)}
          />
        )}
      />

      <Pressable
        onPress={() => void openWebPage(webPages.forgotPassword)}
        accessibilityRole="link"
        style={styles.forgot}
        hitSlop={touch.hitSlop}
      >
        <Text style={styles.forgotText}>Forgot password?</Text>
      </Pressable>

      <Message text={message} />
      <Button
        title="Log In →"
        loadingTitle="Please wait…"
        loading={mutation.isPending}
        onPress={submit}
      />

      <Text variant="note" align="center" style={styles.note}>
        Only your college. Private & safe 🔒
      </Text>

      <View style={styles.switchRow}>
        <Text variant="caption">New to MeetNet? </Text>
        <Pressable
          onPress={() => router.replace('/signup/step-1')}
          accessibilityRole="link"
          hitSlop={touch.hitSlop}
        >
          <Text style={styles.switchLink}>Create account</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginTop: 18, marginBottom: 22, gap: 14 },
  title: {},
  forgot: {
    alignSelf: 'flex-end',
    minHeight: touch.min - 12,
    justifyContent: 'center',
    marginTop: -2,
    marginBottom: 8,
  },
  forgotText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted },
  note: { marginTop: 4 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    marginBottom: 12,
  },
  switchLink: { fontFamily: fonts.bold, fontSize: 12.8, color: colors.text },
});
