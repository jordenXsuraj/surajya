import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useReportPost } from '@/hooks/usePostMutations';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, layout, radius, touch } from '@/theme/tokens';
import { MAX_REPORT_NOTE, REPORT_REASONS, type ReportReason } from '@/types/report';

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.6} />
);

// Same reasons as the web report menu, plus the optional note the API accepts (≤ 300).
export function ReportSheet() {
  const ref = useRef<BottomSheetModal>(null);
  const postId = usePostUi((s) => s.reportPostId);
  const close = usePostUi((s) => s.closeReport);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (postId) ref.current?.present();
    else ref.current?.dismiss();
  }, [postId]);

  return (
    <BottomSheetModal
      ref={ref}
      onDismiss={close}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        {postId ? <ReportForm key={postId} postId={postId} onDone={close} /> : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}

function ReportForm({ postId, onDone }: { postId: string; onDone: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const { mutate, isPending } = useReportPost();

  return (
    <>
      <Text style={styles.title}>Why are you reporting?</Text>
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
        onPress={() => reason && mutate({ postId, reason, note }, { onSettled: onDone })}
      />
      <Button title="Cancel" variant="ghost" onPress={onDone} />
    </>
  );
}

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
  count: {
    alignSelf: 'flex-end',
    fontFamily: fonts.regular,
    fontSize: 10.4,
    color: colors.dim,
    marginTop: -4,
  },
});
