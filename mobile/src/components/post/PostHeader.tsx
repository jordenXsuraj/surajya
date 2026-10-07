import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Text } from '@/components/ui/Text';
import { postTypeInfo } from '@/lib/postTypes';
import { visibleAuthor } from '@/lib/postView';
import { decodeEntities } from '@/lib/text';
import { timeAgo, todayOnlyLabel } from '@/lib/time';
import { colors, fonts, touch, type ColorName } from '@/theme/tokens';
import type { Post, PostType } from '@/types/post';

type PostHeaderProps = {
  post: Post;
  isOwn: boolean;
  following: boolean;
  requested: boolean;
  onPressAuthor: () => void;
  onConnect: () => void;
};

// .pc-head: avatar · name (+ ★ contributor, + Connect) · "2nd yr CS · 3h ago" · type tag.
// Anonymous posts: 👤 "Anonymous", no year/branch, never navigable.
export const PostHeader = memo(function PostHeader({
  post,
  isOwn,
  following,
  requested,
  onPressAuthor,
  onConnect,
}: PostHeaderProps) {
  const author = visibleAuthor(post);
  const showConnect = !!author && !isOwn && !following;
  const info = postTypeInfo(post.type);

  return (
    <View>
      <View style={styles.row}>
        <Pressable
          onPress={author && !isOwn ? onPressAuthor : undefined}
          disabled={!author || isOwn}
          accessibilityRole={author && !isOwn ? 'button' : undefined}
          accessibilityLabel={author ? `${decodeEntities(author.name)}, open profile` : 'Anonymous'}
          style={styles.author}
        >
          <Avatar name={author?.name} uri={author?.avatar} size={38} anonymous={!author} />
          <View style={styles.meta}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {author ? decodeEntities(author.name) : 'Anonymous'}
              </Text>
              {author?.isContributor ? <ContributorBadge /> : null}
            </View>
            <Text style={styles.sub} numberOfLines={1}>
              {author ? `${author.year ?? ''} yr ${author.branch ?? ''} · ` : ''}
              {timeAgo(post.createdAt)}
            </Text>
          </View>
        </Pressable>
        {showConnect ? (
          <Pressable
            onPress={requested ? undefined : onConnect}
            disabled={requested}
            hitSlop={touch.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={requested ? 'Follow request sent' : `Connect with ${author.name}`}
            style={[styles.connect, requested && styles.connectSent]}
          >
            <Text style={[styles.connectText, requested && styles.connectSentText]}>
              {requested ? '⏳' : '🤝 Connect'}
            </Text>
          </Pressable>
        ) : null}
        <View style={[styles.tag, tagStyles[post.type]]}>
          <Text style={[styles.tagText, tagTextStyles[post.type]]} numberOfLines={1}>
            {info.tag}
          </Text>
        </View>
      </View>
      {post.expiresAt ? (
        <View style={styles.today}>
          <Text style={styles.todayText}>{todayOnlyLabel(post.expiresAt)}</Text>
        </View>
      ) : null}
    </View>
  );
});

function ContributorBadge() {
  return (
    <View style={styles.badge} accessibilityLabel="Top Contributor">
      <Text style={styles.badgeStar}>★</Text>
    </View>
  );
}

// One style per post type (no inline objects in render)
const TYPES: PostType[] = ['social', 'placement', 'qa', 'project', 'study', 'confession'];
const tagStyles = StyleSheet.create(
  Object.fromEntries(
    TYPES.map((t) => [t, { backgroundColor: colors[postTypeInfo(t).tint as ColorName] }]),
  ) as Record<PostType, { backgroundColor: string }>,
);
const tagTextStyles = StyleSheet.create(
  Object.fromEntries(
    TYPES.map((t) => [t, { color: colors[postTypeInfo(t).color as ColorName] }]),
  ) as Record<PostType, { color: string }>,
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: touch.min,
    minWidth: 0,
  },
  meta: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14.4, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 10.9, color: colors.dim, marginTop: 1 },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.contributor,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.contributor}, ${colors.contributorEnd})`,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    boxShadow: '0 2px 8px rgba(249,115,22,0.35)',
  },
  badgeStar: { color: colors.white, fontSize: 11, lineHeight: 13 },
  connect: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.connectEnd,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.connect}, ${colors.connectEnd})`,
  },
  connectSent: { backgroundColor: colors.sent, experimental_backgroundImage: 'none' },
  connectText: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.white },
  connectSentText: { color: colors.actText },
  tag: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, flexShrink: 0 },
  tagText: { fontFamily: fonts.bold, fontSize: 11.2 },
  today: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.ol,
  },
  todayText: { fontFamily: fonts.bold, fontSize: 10.4, color: colors.orange },
});
