import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View, type TextInput } from 'react-native';

import { changeEmail } from '@/api/endpoints/users';
import { errorMessage } from '@/api/errors';
import { Button, Input, Message, Text } from '@/components/ui';
import { toSessionUser } from '@/lib/sessionUser';
import { changeEmailSchema, firstError, type ChangeEmailValues } from '@/lib/validation';
import { useAuthStore } from '@/stores/auth.store';

type ChangeEmailFormProps = {
  submitLabel?: string;
  onDone?: (newEmail: string) => void;
};

// Port of ChangeEmailForm.jsx. On success the API ends the other sessions and returns a new token
// for this one, and sends a code to the new address.
export function ChangeEmailForm({ submitLabel = 'Change email', onDone }: ChangeEmailFormProps) {
  const passwordRef = useRef<TextInput>(null);
  const {
    control,
    handleSubmit,
    reset,
    clearErrors,
    formState: { errors },
  } = useForm<ChangeEmailValues>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: '', password: '' },
    reValidateMode: 'onSubmit',
  });

  const mutation = useMutation({
    mutationFn: (values: ChangeEmailValues) => changeEmail(values.newEmail, values.password),
    onSuccess: (data) => {
      const { signIn, markCodeSent } = useAuthStore.getState();
      signIn(data.token, toSessionUser(data.user));
      markCodeSent();
      reset();
      onDone?.(data.user.email);
    },
  });

  const submit = handleSubmit((values) => {
    if (!mutation.isPending) mutation.mutate(values);
  });

  const message =
    firstError(errors) ??
    (mutation.error ? errorMessage(mutation.error, 'Could not change your email') : undefined);

  function edited() {
    clearErrors();
    if (mutation.error) mutation.reset();
  }

  return (
    <View>
      <Controller
        control={control}
        name="newEmail"
        render={({ field }) => (
          <Input
            placeholder="New email address"
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
            invalid={Boolean(errors.newEmail)}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <Input
            ref={passwordRef}
            placeholder="Current password"
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
      <Message text={message} />
      <Button
        title={submitLabel}
        loadingTitle="Saving…"
        loading={mutation.isPending}
        onPress={submit}
      />
      <Text variant="note" align="center" style={styles.note}>
        We'll send a code to the new address. This logs you out on your other devices.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 10 },
});
