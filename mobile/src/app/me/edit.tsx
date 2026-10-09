import { zodResolver } from '@hookform/resolvers/zod';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { errorMessage } from '@/api/errors';
import { BackButton } from '@/components/BackButton';
import { MediaGrid } from '@/components/profile/MediaGrid';
import { SkillPicker } from '@/components/SkillPicker';
import { Button, Chip, Input, Message, Screen, Text } from '@/components/ui';
import { useUpdateProfile } from '@/hooks/useAccount';
import { addMedia, mediaHint } from '@/lib/media';
import { buildProfileUpdate, profileErrorField, toProfileValues } from '@/lib/profile';
import { BRANCHES, roadmapPlaceholder, YEARS } from '@/lib/skills';
import {
  MAX_BIO,
  MAX_NAME,
  MAX_PROJECT_LINK,
  MAX_PROJECT_NAME,
  MAX_PROJECTS,
  MAX_ROADMAP,
  normaliseUsername,
  profileSchema,
  USERNAME_HINT,
  USERNAME_RE,
  type ProfileValues,
} from '@/lib/validation';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, layout, radius, touch } from '@/theme/tokens';

// Edit profile — every field of web Profile.jsx edit mode (name, bio, @username, year, branch,
// skills, projects, media) plus the roadmap. Save stays off until something changed; leaving with
// changes asks first. Server messages about the username show under the username.
export default function EditProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const navigation = useNavigation();
  // What the form started with (fixed for this visit; a save resets the form to the saved values)
  const [initial] = useState(() => (user ? toProfileValues(user) : null));
  const hadUsername = Boolean(initial?.username);
  const schema = useMemo(() => profileSchema(hadUsername), [hadUsername]);
  const {
    control,
    handleSubmit,
    setError,
    reset,
    // destructured here, not read off formState later: the React Compiler would keep a stale value
    formState: { isDirty, isValid },
  } = useForm<ProfileValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? undefined,
    mode: 'onChange',
  });
  const values = useWatch({ control }) as ProfileValues;
  const { mutate: save, isPending } = useUpdateProfile();
  const [formError, setFormError] = useState('');
  const [leaving, setLeaving] = useState(false);

  // Add-project and add-media boxes (not part of the saved values until added)
  const [projectName, setProjectName] = useState('');
  const [projectLink, setProjectLink] = useState('');
  const [projectError, setProjectError] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaError, setMediaError] = useState('');

  usePreventRemove(isDirty && !leaving, ({ data }) => {
    Alert.alert('Discard changes?', 'Your changes to your profile will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  useEffect(() => {
    if (leaving) router.back();
  }, [leaving]);

  if (!user || !initial) return null;

  const onSave = handleSubmit((form) => {
    setFormError('');
    const body = buildProfileUpdate(initial, form);
    if (Object.keys(body).length === 0) return setLeaving(true);
    save(body, {
      onSuccess: () => {
        reset(form);
        setLeaving(true);
      },
      onError: (error) => {
        const message = errorMessage(error, 'Update failed');
        const field = profileErrorField(message);
        if (field) setError(field, { message }, { shouldFocus: true });
        else setFormError(message);
      },
    });
  });

  const footer = (
    <View style={styles.footer}>
      <Message text={formError} />
      <Button
        title="Save changes"
        testID="edit-save"
        loadingTitle="Saving…"
        loading={isPending}
        disabled={!isDirty || !isValid}
        onPress={() => void onSave()}
      />
    </View>
  );

  const username = values.username ?? '';
  const branchChoices = (BRANCHES as readonly string[]).includes(values.branch)
    ? BRANCHES
    : [...BRANCHES, values.branch];
  const hint = mediaHint(mediaUrl);

  return (
    <Screen scroll footer={footer}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          Edit profile
        </Text>
        <View style={styles.headerEnd} />
      </View>

      <Text style={styles.section}>Basic Info</Text>

      <Text style={styles.label}>Name</Text>
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <>
            <Input
              testID="edit-name"
              placeholder="Full name"
              accessibilityLabel="Name"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              maxLength={MAX_NAME}
              invalid={Boolean(fieldState.error)}
            />
            <Message text={fieldState.error?.message ?? ''} />
          </>
        )}
      />

      <Text style={styles.label}>Bio</Text>
      <Controller
        control={control}
        name="bio"
        render={({ field }) => (
          <Input
            testID="edit-bio"
            placeholder="Tell your campus about yourself…"
            accessibilityLabel="Bio"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={MAX_BIO}
            multiline
          />
        )}
      />
      <Text style={styles.counter}>
        {(values.bio ?? '').length}/{MAX_BIO}
      </Text>

      <Text style={styles.label}>Username</Text>
      <Controller
        control={control}
        name="username"
        render={({ field, fieldState }) => (
          <>
            <View style={styles.usernameRow}>
              <Text style={styles.at}>@</Text>
              <View style={styles.flex}>
                <Input
                  testID="edit-username"
                  placeholder="yourname.123"
                  accessibilityLabel="Username"
                  value={field.value}
                  onChangeText={(text) => field.onChange(normaliseUsername(text))}
                  onBlur={field.onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={20}
                  invalid={Boolean(fieldState.error)}
                />
              </View>
            </View>
            {fieldState.error?.message && fieldState.error.message !== USERNAME_HINT ? (
              <Message text={fieldState.error.message} />
            ) : username ? (
              <Text style={[styles.hint, USERNAME_RE.test(username) ? styles.ok : styles.warn]}>
                {USERNAME_RE.test(username) ? `✅ @${username}` : `⚠️ ${USERNAME_HINT}`}
              </Text>
            ) : hadUsername ? (
              <Text style={[styles.hint, styles.warn]}>⚠️ {USERNAME_HINT}</Text>
            ) : null}
          </>
        )}
      />

      <Text style={styles.label}>Year</Text>
      <Controller
        control={control}
        name="year"
        render={({ field }) => (
          <View style={styles.chips} accessibilityRole="radiogroup">
            {YEARS.map((y) => (
              <Chip
                key={y}
                label={y}
                selected={field.value === y}
                onPress={() => field.onChange(y)}
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
          <View style={styles.chips} accessibilityRole="radiogroup">
            {branchChoices.map((b) => (
              <Chip
                key={b}
                label={b}
                selected={field.value === b}
                onPress={() => field.onChange(b)}
              />
            ))}
          </View>
        )}
      />

      <Text style={styles.section}>Skills · {values.branch}</Text>
      <Controller
        control={control}
        name="skills"
        render={({ field }) => (
          <SkillPicker branch={values.branch} skills={field.value} onChange={field.onChange} />
        )}
      />

      <Text style={styles.section}>Projects</Text>
      <Controller
        control={control}
        name="projects"
        render={({ field, fieldState }) => (
          <>
            {field.value.map((p, i) => (
              <View key={`${p.name}-${i}`} style={styles.project}>
                <View style={styles.flex}>
                  <Text style={styles.projectName}>{p.name}</Text>
                  {p.link ? (
                    <Text style={styles.projectLink} numberOfLines={1}>
                      {p.link}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => field.onChange(field.value.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove project ${p.name}`}
                  hitSlop={touch.hitSlop}
                  style={styles.iconButton}
                >
                  <Text>🗑️</Text>
                </Pressable>
              </View>
            ))}
            <Message text={fieldState.error?.message ?? ''} />
            {field.value.length < MAX_PROJECTS ? (
              <View style={styles.addBox}>
                <Input
                  testID="edit-project-name"
                  placeholder="Project name *"
                  value={projectName}
                  onChangeText={(t) => {
                    setProjectName(t);
                    setProjectError('');
                  }}
                  maxLength={MAX_PROJECT_NAME}
                />
                <Input
                  testID="edit-project-link"
                  placeholder="GitHub / link (optional)"
                  value={projectLink}
                  onChangeText={setProjectLink}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={MAX_PROJECT_LINK}
                />
                <Message text={projectError} />
                <Button
                  title="+ Add Project"
                  variant="secondary"
                  haptic={false}
                  onPress={() => {
                    const name = projectName.trim();
                    if (!name) return setProjectError('⚠️ Project name required');
                    field.onChange([...field.value, { name, link: projectLink.trim() }]);
                    setProjectName('');
                    setProjectLink('');
                  }}
                />
              </View>
            ) : (
              <Text variant="note">At most {MAX_PROJECTS} projects.</Text>
            )}
          </>
        )}
      />

      <Text style={styles.section}>Roadmap</Text>
      <Controller
        control={control}
        name="roadmap"
        render={({ field }) => (
          <Input
            testID="edit-roadmap"
            placeholder={roadmapPlaceholder(values.branch)}
            accessibilityLabel="Roadmap"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            maxLength={MAX_ROADMAP}
            multiline
          />
        )}
      />
      <Text style={styles.counter}>
        {(values.roadmap ?? '').length}/{MAX_ROADMAP}
      </Text>

      <Text style={styles.section}>Media (YouTube + Instagram)</Text>
      <Controller
        control={control}
        name="mediaItems"
        render={({ field }) => (
          <>
            <MediaGrid
              items={field.value}
              isOwn
              onRemove={(url) => field.onChange(field.value.filter((m) => m.url !== url))}
            />
            <View style={styles.addBox}>
              <Input
                testID="edit-media-url"
                placeholder="YouTube video URL or instagram.com/yourusername"
                accessibilityLabel="YouTube or Instagram link"
                value={mediaUrl}
                onChangeText={(t) => {
                  setMediaUrl(t);
                  setMediaError('');
                }}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
              />
              {hint ? (
                <Text style={[styles.hint, hint.ok ? styles.ok : styles.warn]}>{hint.text}</Text>
              ) : null}
              <Message text={mediaError} />
              <Button
                title="Add"
                testID="media-add"
                variant="secondary"
                haptic={false}
                disabled={!hint?.ok}
                onPress={() => {
                  const result = addMedia(field.value, mediaUrl);
                  if ('error' in result) return setMediaError(result.error);
                  field.onChange([...field.value, result.item]);
                  setMediaUrl('');
                }}
              />
            </View>
          </>
        )}
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
    marginBottom: 8,
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  headerEnd: { width: 52 },
  section: {
    fontFamily: fonts.extrabold,
    fontSize: 15,
    color: colors.text,
    marginTop: 22,
    marginBottom: 10,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 6,
  },
  counter: {
    alignSelf: 'flex-end',
    fontFamily: fonts.regular,
    fontSize: 10.4,
    color: colors.dim,
    marginTop: 4,
  },
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  at: { fontFamily: fonts.bold, fontSize: 16, color: colors.muted },
  hint: { fontFamily: fonts.semibold, fontSize: 11.5, marginTop: 6 },
  ok: { color: colors.green },
  warn: { color: colors.accent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  project: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  projectName: { fontFamily: fonts.bold, fontSize: 13, color: colors.text },
  projectLink: { fontFamily: fonts.regular, fontSize: 11, color: colors.blue, marginTop: 1 },
  iconButton: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBox: { gap: 8, marginTop: 8 },
  footer: {
    paddingTop: 14,
    paddingHorizontal: layout.gutter,
    paddingBottom: 6,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.br,
    backgroundColor: colors.bg,
  },
});
