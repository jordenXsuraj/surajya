import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useState, type Ref } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useAddReply } from '@/hooks/usePostMutations';
import { colors, fonts, radius, touch } from '@/theme/tokens';
import type { Post } from '@/types/post';

export const MAX_REPLY = 350; // server ReplySchema maxlength

type ReplyComposerProps = {
  post: Post;
  inputRef?: Ref<TextInput>;
  /** Inside the replies bottom sheet (uses the sheet's keyboard-aware input). */
  inSheet?: boolean;
  autoFocus?: boolean;
};

// Web ReplyBox: "Write your answer…" for Q&A, "Write a reply…" otherwise, n/350, Reply / Answer.
// The reply appears at once (optimistic); if sending fails the text comes back into the box.
export function ReplyComposer({
  post,
  inputRef,
  inSheet = false,
  autoFocus = false,
}: ReplyComposerProps) {
  const [text, setText] = useState('');
  const { mutateAsync, isPending } = useAddReply();
  const isQa = post.type === 'qa';
  const trimmed = text.trim();
  const Input = inSheet ? BottomSheetTextInput : TextInput;

  async function submit() {
    if (!trimmed || isPending) return;
    const draft = text;
    setText('');
    try {
      await mutateAsync({ post, text: trimmed });
    } catch {
      setText((current) => current || draft);
    }
  }

  return (
    <View style={styles.wrap}>
      <Input
        ref={inputRef as never}
        value={text}
        onChangeText={setText}
        placeholder={isQa ? 'Write your answer…' : 'Write a reply…'}
        placeholderTextColor={colors.dim}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        maxLength={MAX_REPLY}
        multiline
        autoFocus={autoFocus}
        accessibilityLabel={isQa ? 'Write your answer' : 'Write a reply'}
        style={styles.input}
      />
      <View style={styles.footer}>
        <Text style={styles.count}>
          {text.length}/{MAX_REPLY}
        </Text>
        <Pressable
          onPress={submit}
          disabled={!trimmed || isPending}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          accessibilityState={{ disabled: !trimmed || isPending }}
          style={[styles.send, (!trimmed || isPending) && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>{isQa ? 'Answer' : 'Reply'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: colors.br,
    backgroundColor: colors.bg2,
    gap: 8,
  },
  input: {
    minHeight: 44,
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
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontFamily: fonts.regular, fontSize: 10.4, color: colors.dim },
  send: {
    minWidth: 84,
    height: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  sendDisabled: { opacity: 0.5 },
  sendText: { fontFamily: fonts.bold, fontSize: 13, color: colors.white },
});
