import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, View, type TextInput } from 'react-native';

import { BackButton } from '@/components/BackButton';
import { CollegeInput } from '@/components/CollegeInput';
import { Logo } from '@/components/Logo';
import { Badge, Button, Chip, Input, Message, Screen, Text } from '@/components/ui';
import { BRANCHES, YEARS } from '@/lib/skills';
import {
  firstError,
  signupStep1Schema,
  type SignupStep1Input,
  type SignupStep1Values,
} from '@/lib/validation';
import { useSignupDraft } from '@/stores/signupDraft.store';
import { colors, fonts, touch } from '@/theme/tokens';

// Fields, placeholders, messages and their order follow the web signup (Onboard.jsx StepAuth).

export default function SignupStep1Screen() {
  const draft = useSignupDraft((s) => s.step1);
  const collegeRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    clearErrors,
    formState: { errors },
  } = useForm<SignupStep1Input, unknown, SignupStep1Values>({
    resolver: zodResolver(signupStep1Schema),
    defaultValues: draft ?? {
      name: '',
      college: '',
      year: '',
      branch: 'CS',
      email: '',
      password: '',
    },
    reValidateMode: 'onSubmit',
  });

  const submit = handleSubmit((values) => {
    useSignupDraft.getState().setStep1(values);
    router.push('/signup/step-2');
  });

  const message = firstError(errors);

  return (
    <Screen scroll>
      <BackButton />
      <View style={styles.header}>
        <Logo size="sm" />
        <Badge label="Step 1 of 2" />
      </View>
      <Text variant="title" style={styles.title}>
        Create your account
      </Text>

      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <Input
            placeholder="Enter Your Name"
            value={field.value}
            onChangeText={(t) => {
              field.onChange(t);
              clearErrors();
            }}
            onBlur={field.onBlur}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={60}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => collegeRef.current?.focus()}
            invalid={Boolean(errors.name)}
          />
        )}
      />

      <Controller
        control={control}
        name="college"
        render={({ field }) => (
          <CollegeInput
            ref={collegeRef}
            value={field.value}
            onChange={(t) => {
              field.onChange(t);
              clearErrors();
            }}
            onSubmitEditing={() => emailRef.current?.focus()}
            invalid={Boolean(errors.college)}
          />
        )}
      />

      <Text style={styles.label}>Year</Text>
      <Controller
        control={control}
        name="year"
        render={({ field }) => (
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Year">
            {YEARS.map((year) => (
              <Chip
                key={year}
                label={year}
                selected={field.value === year}
                onPress={() => {
                  field.onChange(year);
                  clearErrors();
                }}
                accessibilityLabel={`${year} year`}
              />
            ))}
          </View>
        )}
      />

      <Text style={styles.label}>Branch</Text>
      <Controller
        control={control}
        name="branch"
        render={({ field }) => (
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Branch">
            {BRANCHES.map((branch) => (
              <Chip
                key={branch}
                label={branch}
                selected={field.value === branch}
                onPress={() => {
                  field.onChange(branch);
                  clearErrors();
                }}
              />
            ))}
          </View>
        )}
      />

      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <Input
            ref={emailRef}
            placeholder="Enter your Email"
            value={field.value}
            onChangeText={(t) => {
              field.onChange(t);
              clearErrors();
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
            placeholder="Password (min 8 characters)"
            value={field.value}
            onChangeText={(t) => {
              field.onChange(t);
              clearErrors();
            }}
            onBlur={field.onBlur}
            password
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
            invalid={Boolean(errors.password)}
          />
        )}
      />

      <Message text={message} />
      <Button title="Continue →" onPress={submit} />

      <View style={styles.switchRow}>
        <Text variant="caption">Already have an account? </Text>
        <Pressable
          onPress={() => router.replace('/login')}
          accessibilityRole="link"
          hitSlop={touch.hitSlop}
        >
          <Text style={styles.switchLink}>Log In</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  title: { marginTop: 18, marginBottom: 16 },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginBottom: 8,
    marginLeft: 2,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },
  switchLink: { fontFamily: fonts.bold, fontSize: 12.8, color: colors.text },
});
