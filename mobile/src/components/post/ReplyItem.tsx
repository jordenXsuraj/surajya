import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { isAnonAuthorReply, isOwnReply, replyAuthorName } from '@/lib/postView';
import { decodeEntities } from '@/lib/text';
import { timeAgo } from '@/lib/time';
import { colors, fonts, hitSlopFor, touch } from '@/theme/tokens';
import type { Reply } from '@/types/post';

type ReplyItemProps = {
  reply: Reply;
  viewerId: string;
  onDelete: (reply: Reply) => void;
  onPressAuthor: (userId: string) => void;
  /** Reply menu (Report reply, Block; Delete on your own): long-press the reply or tap ⋯. */
  onMore: (reply: Reply) => void;
};

// The 🗑️ / ⋯ glyphs are ~16 pt: this makes their touch area 44 pt.
const SMALL_HIT = hitSlopFor(16);

// Web ReplyItem: avatar · name · "2nd yr · 3h ago" · 🗑️ on your own replies (⋯ on the others:
// report, block). The anonymous author's own replies show as "Anonymous (author)" and are
// never navigable.
export const ReplyItem = memo(function ReplyItem({
  reply,
  viewerId,
  onDelete,
  onPressAuthor,
  onMore,
}: ReplyItemProps) {
  const anonAuthor = isAnonAuthorReply(reply);
  const own = isOwnReply(reply, viewerId);
  const authorId = reply.postedBy?._id ? String(reply.postedBy._id) : null;
  const canVisit = !!authorId && authorId !== viewerId;
  const name = decodeEntities(replyAuthorName(reply));

  return (
    <Pressable
      onLongPress={reply.pending ? undefined : () => onMore(reply)}
      delayLongPress={350}
      // Screen readers reach the menu through the ⋯ / 🗑️ button instead
      accessible={false}
      style={[styles.row, reply.pending && styles.pending]}
      testID="reply-item"
    >
      <Pressable
        onPress={canVisit ? () => onPressAuthor(authorId) : undefined}
        disabled={!canVisit}
        accessibilityRole={canVisit ? 'button' : undefined}
        accessibilityLabel={canVisit ? `${name}, open profile` : name}
        hitSlop={touch.hitSlop}
      >
        <Avatar
          name={reply.postedBy?.name}
          uri={reply.postedBy?.avatar}
          size={28}
          anonymous={anonAuthor}
        />
      </Pressable>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            style={styles.name}
            numberOfLines={1}
            onPress={canVisit ? () => onPressAuthor(authorId) : undefined}
          >
            {name}
          </Text>
          <Text style={styles.meta}>
            {reply.postedBy?.year ? `${reply.postedBy.year} yr · ` : ''}
            {reply.pending ? 'sending…' : timeAgo(reply.createdAt)}
          </Text>
          <View style={styles.spacer} />
          {reply.pending ? (
            <ActivityIndicator size="small" color={colors.dim} />
          ) : own ? (
            <Pressable
              onPress={() => onDelete(reply)}
              hitSlop={SMALL_HIT}
              accessibilityRole="button"
              accessibilityLabel="Delete your reply"
              style={styles.delete}
            >
              <Text style={styles.deleteText}>🗑️</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => onMore(reply)}
              hitSlop={SMALL_HIT}
              accessibilityRole="button"
              accessibilityLabel={`More options for ${name}'s reply`}
              style={styles.more}
              testID="reply-more"
            >
              <Text style={styles.moreText}>⋯</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.text}>{decodeEntities(reply.text)}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', paddingVertical: 8 },
  pending: { opacity: 0.6 },
  content: { flex: 1, minWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 3 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 12, color: colors.text },
  meta: { fontFamily: fonts.regular, fontSize: 10, color: colors.dim },
  spacer: { flex: 1 },
  delete: { paddingHorizontal: 3, opacity: 0.6 },
  deleteText: { fontSize: 12.5 },
  more: { paddingHorizontal: 3 },
  moreText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 16, color: colors.muted },
  text: { fontFamily: fonts.regular, fontSize: 12.8, lineHeight: 20.5, color: colors.muted },
});
