import { useMutation } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { signup } from '@/api/endpoints/auth';
import { errorMessage } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { Logo } from '@/components/Logo';
import { TermsCheckbox } from '@/components/TermsCheckbox';
import { Badge, Button, Chip, Input, Message, Screen, Text } from '@/components/ui';
import { toSessionUser } from '@/lib/sessionUser';
import { BRANCH_SKILLS, MAX_SKILLS, roadmapPlaceholder, type Branch } from '@/lib/skills';
import {
  MAX_PROJECT_NAME,
  buildSignupRequest,
  signupStep2Schema,
  type SignupStep2Values,
} from '@/lib/validation';
import { useAuthStore } from '@/stores/auth.store';
import { useSignupDraft } from '@/stores/signupDraft.store';
import { colors, fonts, layout } from '@/theme/tokens';

// Web Onboard.jsx StepProfile (unreachable on the web today, where signup is one screen).
// Profile fields are optional; "Skip for now" sends the same request, like the web.

export default function SignupStep2Screen() {
  const step1 = useSignupDraft((s) => s.step1);

  const [skills, setSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectLink, setProjectLink] = useState('');
  const [roadmap, setRoadmap] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: signup,
    onSuccess: (data) => {
      const auth = useAuthStore.getState();
      // The API emails a verification code on signup; the tabs layout opens /verify-email.
      auth.signIn(data.token, toSessionUser(data.user), { pendingVerify: true });
      auth.markCodeSent();
      useSignupDraft.getState().clear();
    },
    onError: (e) => setError(errorMessage(e, 'Signup failed')),
  });

  // Opened without step 1 (e.g. after a reload): start over.
  if (!step1) return <Redirect href="/signup/step-1" />;

  const branch = step1.branch as Branch;
  const branchSkills = BRANCH_SKILLS[branch] ?? BRANCH_SKILLS.CS;
  const customSkills = skills.filter((s) => !branchSkills.includes(s));

  // Like the web: branch chips toggle freely; your own skills can be added while fewer than
  // MAX_SKILLS are selected in total.
  function toggleSkill(skill: string) {
    setSkills((current) =>
      current.includes(skill) ? current.filter((s) => s !== skill) : [...current, skill],
    );
  }

  function addCustom() {
    const skill = customSkill.trim();
    if (!skill) return;
    if (skills.includes(skill)) return setCustomSkill('');
    if (skills.length >= MAX_SKILLS) return;
    setSkills((current) => [...current, skill]);
    setCustomSkill('');
  }

  function finish() {
    if (mutation.isPending || !step1) return;
    setError('');
    const values: SignupStep2Values = { skills, projectName, projectLink, roadmap, acceptTerms };
    const parsed = signupStep2Schema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the form');
    mutation.mutate(buildSignupRequest(step1, parsed.data));
  }

  const footer = (
    <View style={styles.footer}>
      <Message text={error} />
      <Button
        title="Enter MeetNet🚀"
        loadingTitle="Creating account…"
        loading={mutation.isPending}
        onPress={finish}
      />
      <Button
        title="Skip for now — fill later"
        variant="link"
        onPress={finish}
        disabled={mutation.isPending}
      />
    </View>
  );

  return (
    <Screen scroll footer={footer}>
      <BackButton />
      <View style={styles.header}>
        <Logo size="sm" />
        <Badge label="Step 2 of 2" />
      </View>

      <View style={styles.branchPill}>
        <Text style={styles.branchText}>
          🎓 {step1.branch} branch
          <Text style={styles.branchHint}> · showing relevant skills</Text>
        </Text>
      </View>

      <Text variant="title">Pick your skills ⚡</Text>
      <Text variant="caption" style={styles.sub}>
        Others find you by these. Select all that apply.
      </Text>
      <View style={styles.chips}>
        {branchSkills.map((skill) => (
          <Chip
            key={skill}
            label={skills.includes(skill) ? `✓ ${skill}` : skill}
            accessibilityLabel={skill}
            selected={skills.includes(skill)}
            onPress={() => toggleSkill(skill)}
          />
        ))}
        {customSkills.map((skill) => (
          <Chip
            key={skill}
            label={`✓ ${skill} ✕`}
            accessibilityLabel={`${skill}, remove`}
            selected
            dashed
            onPress={() => toggleSkill(skill)}
          />
        ))}
      </View>

      <View style={styles.customRow}>
        <View style={styles.flex}>
          <Input
            placeholder="+ Add your own skill"
            value={customSkill}
            onChangeText={setCustomSkill}
            returnKeyType="done"
            submitBehavior="submit"
            onSubmitEditing={addCustom}
            maxLength={40}
          />
        </View>
        <Button
          title="Add"
          onPress={addCustom}
          disabled={!customSkill.trim() || skills.length >= MAX_SKILLS}
          style={styles.addButton}
          haptic={false}
        />
      </View>
      {skills.length >= MAX_SKILLS && (
        <Text variant="note" style={styles.counter}>
          You can add your own skills while fewer than {MAX_SKILLS} are selected.
        </Text>
      )}

      <Text variant="title" style={styles.section}>
        Add a project 🚀
      </Text>
      <Text variant="caption" style={styles.sub}>
        Even a small one. Others connect through your work.
      </Text>
      <Input
        placeholder="Project name"
        value={projectName}
        onChangeText={setProjectName}
        maxLength={MAX_PROJECT_NAME}
      />
      <Input
        placeholder="GitHub / link (optional)"
        value={projectLink}
        onChangeText={setProjectLink}
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={200}
      />

      <Text variant="title" style={styles.section}>
        Your roadmap 📍
      </Text>
      <Text variant="caption" style={styles.sub}>
        What are you currently learning or building?
      </Text>
      <Input
        placeholder={roadmapPlaceholder(step1.branch)}
        value={roadmap}
        onChangeText={setRoadmap}
        multiline
        maxLength={500}
      />

      <TermsCheckbox
        checked={acceptTerms}
        onChange={(checked) => {
          setAcceptTerms(checked);
          setError('');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 20,
  },
  branchPill: {
    alignSelf: 'flex-start',
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: colors.bg3,
    borderWidth: 1,
    borderColor: colors.br2,
    borderRadius: 999,
    marginBottom: 14,
  },
  branchText: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted },
  branchHint: { fontSize: 11.2, color: colors.dim },
  sub: { marginTop: 4, marginBottom: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 6 },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 10 },
  addButton: {
    width: 'auto',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 16,
    boxShadow: 'none',
  },
  counter: { marginTop: -4, marginLeft: 2 },
  section: { marginTop: 22 },
  footer: {
    paddingTop: 14,
    paddingHorizontal: layout.gutter,
    paddingBottom: 6,
    borderTopWidth: 1,
    borderTopColor: colors.br,
    backgroundColor: colors.bg,
  },
});
