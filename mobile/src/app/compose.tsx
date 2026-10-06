import { router, useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View, type TextInput } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, errorMessage } from '@/api/errors';
import { AttachmentBar, type AttachmentKind } from '@/components/compose/AttachmentBar';
import { PdfBlock } from '@/components/compose/PdfBlock';
import { PhotoBlock } from '@/components/compose/PhotoBlock';
import { ToggleRow } from '@/components/compose/ToggleRow';
import { TypeGrid } from '@/components/compose/TypeGrid';
import { YouTubePreview } from '@/components/compose/YouTubePreview';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Text } from '@/components/ui/Text';
import { usePdfUpload, usePhotoUpload } from '@/hooks/useComposeUploads';
import { useCreatePost } from '@/hooks/useCreatePost';
import {
  COMPOSE_SUBTITLE,
  COMPOSE_TITLE,
  MAX_POST,
  MAX_TAGS,
  MIN_POST,
  buildCreatePostBody,
  cleanTags,
  composeSchema,
  placeholderFor,
  submitLabel,
  type ComposeValues,
} from '@/lib/compose';
import { clearDraft, isEmptyDraft, loadDraft, saveDraft } from '@/lib/composeDraft';
import { normaliseLink } from '@/lib/postView';
import { getYouTubeId } from '@/lib/youtube';
import { useAppConfig } from '@/stores/appConfig.store';
import { usePostUi } from '@/stores/postUi.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';
import type { PostType } from '@/types/post';

const FOOTER_HEIGHT = 76;

const toast = (message: string, type: 'info' | 'success' | 'error' = 'info') =>
  useUiStore.getState().showToast(message, type);

// Native port of nexusnetwork/src/pages/Post.jsx, opened as the /compose modal.
export default function ComposeScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const confessionsEnabled = useAppConfig((s) => s.confessionsEnabled);
  const pdfUploads = useAppConfig((s) => s.pdfUploads);

  // Restore an unfinished draft (crash / app killed); never restore a hidden type
  const [initial] = useState<ComposeValues>(() => {
    const draft = loadDraft();
    return !confessionsEnabled && draft.type === 'confession'
      ? { ...draft, type: 'social', anonymous: false }
      : draft;
  });
  const [type, setType] = useState<PostType>(initial.type);
  const [text, setText] = useState(initial.text);
  const [anonymous, setAnonymous] = useState(initial.anonymous);
  const [todayOnly, setTodayOnly] = useState(initial.todayOnly);
  const [tags, setTags] = useState(initial.tags);
  const [link, setLink] = useState(initial.link);
  const [youtubeUrl, setYoutubeUrl] = useState(initial.youtubeUrl);
  const [open, setOpen] = useState({
    youtube: Boolean(initial.youtubeUrl),
    link: Boolean(initial.link),
    tags: Boolean(initial.tags),
  });
  const [leaving, setLeaving] = useState(false);
  const textRef = useRef<TextInput>(null);

  // Confessions switched off remotely while this screen is open: treat it as Social
  const fellBack = !confessionsEnabled && type === 'confession';
  const postType: PostType = fellBack ? 'social' : type;
  const isAnonymous = fellBack ? false : anonymous;

  const photo = usePhotoUpload(initial.imageUrl);
  const pdf = usePdfUpload(initial.pdf);
  const create = useCreatePost();

  const values: ComposeValues = {
    type: postType,
    text,
    anonymous: isAnonymous,
    todayOnly,
    tags,
    link,
    youtubeUrl,
    imageUrl: photo.url,
    pdf: pdf.value,
  };

  // Crash safety: every change goes to MMKV (cleared after posting or discarding)
  const pdfUrl = pdf.value?.url ?? '';
  useEffect(() => {
    if (!leaving) saveDraft(values);
    // values is rebuilt every render; these are its parts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, text, anonymous, todayOnly, tags, link, youtubeUrl, photo.url, pdfUrl, leaving]);

  useEffect(() => {
    if (!isEmptyDraft(initial)) toast('📝 Draft restored');
  }, [initial]);

  // Focus the text box once the slide-in has finished, not on mount (autoFocus): focused during the
  // transition, KeyboardAwareScrollView measures it mid-animation and can leave it under the
  // keyboard. The timer covers a transition event that never comes.
  useEffect(() => {
    const stack = navigation as unknown as NativeStackNavigationProp<
      Record<string, object | undefined>
    >;
    const focus = () => textRef.current?.focus();
    const fallback = setTimeout(focus, 1000);
    const unsubscribe = stack.addListener('transitionEnd', (e) => {
      if (e.data.closing) return;
      clearTimeout(fallback);
      focus();
    });
    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [navigation]);

  const photoBusy = photo.state.status === 'compressing' || photo.state.status === 'uploading';
  const pdfBusy = pdf.state.status === 'uploading';
  const uploading = photoBusy || pdfBusy;
  const uploadFailed = photo.state.status === 'error' || pdf.state.status === 'error';
  const check = composeSchema.safeParse(values);
  const problem = check.success ? null : (check.error.issues[0]?.message ?? 'Check your post');
  const canSubmit = check.success && !uploading && !uploadFailed && !create.isPending;
  const hasContent =
    !isEmptyDraft(values) || photo.state.status !== 'idle' || pdf.state.status !== 'idle';

  // ✕, Android back and iOS swipe-down all come through here
  usePreventRemove(hasContent && !leaving, ({ data }) => {
    Alert.alert('Discard post?', 'Your text and attachments will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          photo.remove();
          pdf.remove();
          clearDraft();
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  // After posting: close, go to Home and scroll it to the new post at the top
  useEffect(() => {
    if (!leaving) return;
    if (router.canGoBack()) router.back();
    router.navigate('/');
    usePostUi.getState().scrollHomeToTop();
  }, [leaving]);

  function selectType(next: PostType) {
    setType(next);
    setAnonymous(next === 'confession'); // web: confession forces it on, other types reset it
  }

  function onAttachment(kind: AttachmentKind) {
    switch (kind) {
      case 'photo':
        if (youtubeUrl.trim()) return toast('⚠️ Remove YouTube video first');
        if (photo.state.status !== 'idle') return;
        Alert.alert('Add a photo', undefined, [
          { text: 'Take photo', onPress: () => void photo.pick('camera') },
          { text: 'Choose from library', onPress: () => void photo.pick('library') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      case 'youtube':
        if (photo.state.status !== 'idle') return toast('⚠️ Remove image first');
        return setOpen((o) => ({ ...o, youtube: !o.youtube || Boolean(youtubeUrl) }));
      case 'pdf':
        if (pdf.state.status === 'idle') void pdf.pick();
        return;
      case 'link':
        return setOpen((o) => ({ ...o, link: !o.link || Boolean(link) }));
      case 'tags':
        return setOpen((o) => ({ ...o, tags: !o.tags || Boolean(tags) }));
    }
  }

  function submit() {
    if (create.isPending) return;
    if (photoBusy) return toast('⏳ Wait for image upload');
    if (pdfBusy) return toast('⏳ Wait for PDF upload');
    if (photo.state.status === 'error')
      return toast('❌ Image upload failed. Remove it or try again.');
    if (pdf.state.status === 'error') return toast('❌ PDF upload failed. Remove it or try again.');
    if (!check.success) return toast(`⚠️ ${problem}`);
    create.mutate(buildCreatePostBody(values), {
      onSuccess: () => {
        toast('✅ Posted!', 'success');
        setLeaving(true);
      },
      onError: (error) => {
        // EMAIL_NOT_VERIFIED opens the verify sheet; everything typed stays
        if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') return;
        toast(`❌ ${errorMessage(error, 'Could not publish')}`, 'error');
      },
    });
  }

  const ytId = getYouTubeId(youtubeUrl);
  const tagList = cleanTags(tags);
  const linkUrl = link.trim() ? normaliseLink(link.trim()) : null;
  const len = text.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text variant="title">{COMPOSE_TITLE}</Text>
          <Text variant="caption">{COMPOSE_SUBTITLE}</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={touch.hitSlop}
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={FOOTER_HEIGHT + 16}
      >
        <Text style={styles.label} testID="compose-heading">
          What are you sharing?
        </Text>
        <TypeGrid value={postType} onChange={selectType} confessionsEnabled={confessionsEnabled} />

        {postType === 'confession' ? (
          <View style={styles.confession}>
            <Text style={styles.confessionText}>🤫 Confessions are always posted anonymously</Text>
          </View>
        ) : (
          <ToggleRow
            icon="👤"
            label="Post anonymously"
            sub="Your name is completely hidden"
            value={isAnonymous}
            onChange={setAnonymous}
          />
        )}
        <ToggleRow
          label="⏳ Today Only"
          sub="Post disappears after 24 hours"
          value={todayOnly}
          onChange={setTodayOnly}
          tint={colors.orange}
        />

        <Text style={styles.label}>Write your post</Text>
        <Input
          ref={textRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholderFor(postType)}
          multiline
          maxLength={MAX_POST}
          style={styles.textarea}
          accessibilityLabel="Write your post"
          testID="compose-text"
        />
        <View style={styles.counterRow}>
          <Text style={styles.hint}>
            {len > 0 && text.trim().length < MIN_POST ? `At least ${MIN_POST} characters` : ''}
          </Text>
          <Text style={styles.counter}>
            {len}/{MAX_POST}
          </Text>
        </View>

        <AttachmentBar
          onPress={onAttachment}
          items={[
            { kind: 'photo', label: '📸 Photo', active: photo.state.status !== 'idle' },
            { kind: 'youtube', label: '🎥 YouTube', active: Boolean(ytId) },
            ...(pdfUploads
              ? [{ kind: 'pdf' as const, label: '📄 PDF', active: pdf.state.status !== 'idle' }]
              : []),
            { kind: 'link', label: '🔗 Link', active: Boolean(linkUrl) },
            {
              kind: 'tags',
              label: tagList.length ? `🏷️ ${tagList.length} Tags` : '🏷️ Tags',
              active: tagList.length > 0,
            },
          ]}
        />

        <PhotoBlock state={photo.state} onRetry={photo.retry} onRemove={photo.remove} />
        <PdfBlock state={pdf.state} onRetry={pdf.retry} onRemove={pdf.remove} />

        {open.youtube ? (
          <View style={styles.field}>
            <Text style={styles.label}>YouTube Video</Text>
            <Input
              value={youtubeUrl}
              onChangeText={setYoutubeUrl}
              placeholder="Paste YouTube link"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              invalid={Boolean(youtubeUrl.trim()) && !ytId}
            />
            {youtubeUrl.trim() && !ytId ? (
              <Text style={styles.error}>That doesn't look like a YouTube video link</Text>
            ) : null}
            {ytId ? <YouTubePreview videoId={ytId} onRemove={() => setYoutubeUrl('')} /> : null}
          </View>
        ) : null}

        {open.link ? (
          <View style={styles.field}>
            <Text style={styles.label}>Any Link</Text>
            <Input
              value={link}
              onChangeText={setLink}
              placeholder="GitHub, Drive, LinkedIn, Notion..."
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              invalid={Boolean(link.trim()) && !linkUrl}
            />
            {link.trim() ? (
              <Text style={linkUrl ? styles.hint : styles.error} numberOfLines={1}>
                {linkUrl ? `Opens ${linkUrl}` : 'Enter a valid link'}
              </Text>
            ) : null}
          </View>
        ) : null}

        {open.tags ? (
          <View style={styles.field}>
            <Text style={styles.label}>
              Tags <Text style={styles.optional}>— comma separated, max {MAX_TAGS}</Text>
            </Text>
            <Input
              value={tags}
              onChangeText={setTags}
              placeholder="DSA, placement, TCS"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {tagList.length ? (
              <View style={styles.tags}>
                {tagList.map((t) => (
                  <View key={t} style={styles.tag}>
                    <Text style={styles.tagText}>#{t}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button
            title={
              photo.state.status === 'uploading'
                ? `Uploading ${Math.round(photo.state.progress * 100)}%…`
                : submitLabel(values)
            }
            loadingTitle="Posting…"
            loading={create.isPending}
            disabled={!canSubmit}
            onPress={submit}
            accessibilityHint={problem ?? undefined}
          />
        </View>
      </KeyboardStickyView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: layout.gutter,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  titles: { flex: 1, gap: 3 },
  close: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, color: colors.muted },
  content: { paddingHorizontal: layout.gutter, paddingTop: 14, paddingBottom: 24 },
  label: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.muted, marginBottom: 8 },
  optional: { fontFamily: fonts.medium, color: colors.dim },
  confession: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(168,85,247,0.1)',
  },
  confessionText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.purple },
  textarea: { minHeight: 140, maxHeight: 280, backgroundColor: colors.bg2, lineHeight: 23.8 },
  counterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    marginBottom: 12,
  },
  counter: { fontFamily: fonts.regular, fontSize: 10.4, color: colors.dim },
  hint: { fontFamily: fonts.regular, fontSize: 11.2, color: colors.dim },
  error: { fontFamily: fonts.regular, fontSize: 11.2, color: colors.accent },
  field: { marginTop: 14 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: {
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.bg3,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 10.9, color: colors.muted },
  footer: {
    paddingTop: 12,
    paddingHorizontal: layout.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.br,
    backgroundColor: colors.bg,
  },
});
