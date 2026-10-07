import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { colors, fonts, touch } from '@/theme/tokens';
import type { PostType } from '@/types/post';

type PostActionBarProps = {
  type: PostType;
  liked: boolean;
  likeCount: number;
  replyCount: number;
  interested: boolean;
  onLike: () => void;
  onReplies: () => void;
  onInterested: () => void;
  onMenu: () => void;
};

// .pc-actions: like · replies (Answer for Q&A) · Interested (project) · ⋯ (save, share, report…)
export const PostActionBar = memo(function PostActionBar({
  type,
  liked,
  likeCount,
  replyCount,
  interested,
  onLike,
  onReplies,
  onInterested,
  onMenu,
}: PostActionBarProps) {
  const replyLabel =
    type === 'project'
      ? `💬 ${replyCount > 0 ? replyCount : ''}`.trim()
      : `${type === 'qa' ? '✍️ Answer' : '💬'}${replyCount > 0 ? ` (${replyCount})` : ''}`;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onLike();
        }}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityState={{ selected: liked }}
        accessibilityLabel={`${liked ? 'Unlike' : 'Like'}, ${likeCount} like${likeCount === 1 ? '' : 's'}`}
        style={[styles.act, liked && styles.liked]}
      >
        <Text style={[styles.actText, liked && styles.likedText]}>
          {liked ? '❤️' : '🤍'} {likeCount}
        </Text>
      </Pressable>

      {type === 'project' ? (
        <Pressable
          onPress={interested ? undefined : onInterested}
          disabled={interested}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          accessibilityState={{ disabled: interested }}
          style={[styles.interested, interested && styles.interestedOn]}
        >
          <Text style={[styles.interestedText, interested && styles.interestedOnText]}>
            {interested ? '🙋 Interested!' : '🙋 Interested'}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={onReplies}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityLabel={`${type === 'qa' ? 'Answers' : 'Replies'}${replyCount ? `, ${replyCount}` : ''}`}
        style={styles.act}
      >
        <Text style={styles.actText}>{replyLabel}</Text>
      </Pressable>

      <View style={styles.spacer} />

      <Pressable
        onPress={onMenu}
        hitSlop={touch.hitSlop}
        accessibilityRole="button"
        accessibilityLabel="More: save, share, report"
        style={styles.menu}
      >
        <Text style={styles.menuText}>⋯</Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  // later .act-btn rules on the web: #111 pill, #2a2a2a border, #aaa 13px
  act: {
    minHeight: 32,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.actBg,
    borderWidth: 1,
    borderColor: colors.actBorder,
  },
  actText: { fontFamily: fonts.semibold, fontSize: 13, color: colors.actText },
  liked: {
    backgroundColor: colors.like,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.like}, ${colors.likeEnd})`,
    borderColor: 'transparent',
    boxShadow: `0 0 10px ${colors.likeGlow}`,
  },
  likedText: { color: colors.white },
  interested: {
    minHeight: 32,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.green,
    backgroundColor: colors.gl,
  },
  interestedOn: { backgroundColor: colors.green, boxShadow: '0 4px 14px rgba(34,197,94,0.3)' },
  interestedText: { fontFamily: fonts.bold, fontSize: 11.7, color: colors.green },
  interestedOnText: { color: colors.white },
  spacer: { flex: 1 },
  menu: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: colors.actBg,
    borderWidth: 1,
    borderColor: colors.actBorder,
  },
  menuText: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 18, color: colors.actText },
});
