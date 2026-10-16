import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useReportUser } from '@/hooks/useFollow';
import { useModalSheet } from '@/hooks/useModalSheet';
import { useReportPost, useReportReply } from '@/hooks/usePostMutations';
import { emailSupport, openWebPage, SUPPORT_EMAIL, webPages } from '@/lib/links';
import { usePostUi, type ReportTarget } from '@/stores/postUi.store';
import { colors, fonts, layout, radius, touch } from '@/theme/tokens';
import { MAX_REPORT_NOTE, REPORT_REASONS, type ReportReason } from '@/types/report';

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

// Same reasons as the web report menu, plus the optional note the API accepts (≤ 300).
// Reports a post (post ⋯ menu), a reply (reply menu) or a user (profile ⋯ menu). Says how reports
// are handled and links the Community Guidelines and support (App Store guideline 1.2).
export function ReportSheet() {
  const target = usePostUi((s) => s.report);
  const close = usePostUi((s) => s.closeReport);
  const { ref, onDismiss } = useModalSheet(Boolean(target), close);
  const insets = useSafeAreaInsets();

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={onDismiss}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {target ? <ReportForm key={target.id} target={target} onDone={close} /> : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function ReportForm({ target, onDone }: { target: ReportTarget; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const reportPost = useReportPost();
  const reportReply = useReportReply();
  const reportUser = useReportUser();
  const isPending = reportPost.isPending || reportReply.isPending || reportUser.isPending;

  const submit = (picked: ReportReason) => {
    if (target.kind === 'user') {
      reportUser.mutate({ id: target.id, reason: picked, note }, { onSettled: onDone });
    } else if (target.kind === 'reply') {
      reportReply.mutate(
        { postId: target.postId, replyId: target.id, reason: picked, note },
        { onSettled: onDone },
      );
    } else {
      reportPost.mutate({ postId: target.id, reason: picked, note }, { onSettled: onDone });
    }
  };

  return (
    <>
      <Text style={styles.title} accessibilityRole="header">
        {TITLE[target.kind]}
      </Text>
      <View style={styles.reasons} accessibilityRole="radiogroup">
        {REPORT_REASONS.map((r) => {
          const on = reason === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => setReason(r.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[styles.reason, on && styles.reasonOn]}
            >
              <Text style={[styles.reasonText, on && styles.reasonTextOn]}>{r.label}</Text>
              <View style={[styles.radio, on && styles.radioOn]} />
            </Pressable>
          );
        })}
      </View>
      <BottomSheetTextInput
        value={note}
        onChangeText={setNote}
        placeholder="Add a note (optional)"
        placeholderTextColor={colors.dim}
        selectionColor={colors.accent}
        maxLength={MAX_REPORT_NOTE}
        multiline
        style={styles.note}
        accessibilityLabel="Add a note (optional)"
      />
      <Text style={styles.count}>
        {note.length}/{MAX_REPORT_NOTE}
      </Text>
      <Button
        title="Submit report"
        loadingTitle="Sending…"
        loading={isPending}
        disabled={!reason}
        onPress={() => reason && submit(reason)}
      />
      <Button title="Cancel" variant="ghost" onPress={onDone} />
      <Text style={styles.policy}>
        We review every report within 24 hours and remove content or accounts that break our{' '}
        <Text
          style={styles.link}
          accessibilityRole="link"
          onPress={() => void openWebPage(webPages.communityGuidelines)}
        >
          Community Guidelines
        </Text>
        . Questions:{' '}
        <Text style={styles.link} accessibilityRole="link" onPress={() => void emailSupport()}>
          {SUPPORT_EMAIL}
        </Text>
      </Text>
    </>
  );
}

const TITLE: Record<ReportTarget['kind'], string> = {
  post: 'Why are you reporting?',
  reply: 'Why are you reporting this reply?',
  user: 'Why are you reporting this person?',
};

const styles = StyleSheet.create({
  background: { backgroundColor: colors.bg2 },
  handle: { backgroundColor: colors.br2, width: 40 },
  content: { paddingHorizontal: layout.gutter, paddingTop: 4, gap: 10 },
  title: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  reasons: { gap: 6 },
  reason: {
    minHeight: touch.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.bg3,
  },
  reasonOn: { borderColor: colors.accent, backgroundColor: colors.al },
  reasonText: { fontFamily: fonts.semibold, fontSize: 13.6, color: colors.muted },
  reasonTextOn: { color: colors.text },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.br2 },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  note: {
    minHeight: 64,
    maxHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.bg3,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13.6,
    textAlignVertical: 'top',
  },
  policy: {
    fontFamily: fonts.regular,
    fontSize: 11.5,
    lineHeight: 17,
    color: colors.muted,
    textAlign: 'center',
  },
  link: { color: colors.text, textDecorationLine: 'underline' },
  count: {
    alignSelf: 'flex-end',
    fontFamily: fonts.regular,
    fontSize: 10.4,
    color: colors.dim,
    marginTop: -4,
  },
});
