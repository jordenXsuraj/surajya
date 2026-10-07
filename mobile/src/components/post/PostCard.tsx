import { useRecyclingState } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { PostActionBar } from '@/components/post/PostActionBar';
import { PostHeader } from '@/components/post/PostHeader';
import { PostImage, PostLink, PostPdf, PostTags, PostVideo } from '@/components/post/PostMedia';
import { PostText } from '@/components/post/PostText';
import type { PostActions } from '@/hooks/usePostActions';
import {
  INTEREST_TEXT,
  isLikedBy,
  isOwnPost,
  isOwnReply,
  likeCountOf,
  replyCountOf,
  visibleAuthor,
} from '@/lib/postView';
import { colors } from '@/theme/tokens';
import type { Post } from '@/types/post';

export type PostCardProps = {
  post: Post;
  viewerId: string;
  /** The viewer follows the author (hides "Connect"). */
  following: boolean;
  /** A follow request to the author is pending. */
  requested: boolean;
  actions: PostActions;
  /** 'detail' = post screen: full text, no tap-to-open. */
  variant?: 'feed' | 'detail';
};

// Native port of nexusnetwork/src/components/PostCard.jsx. Memoised: it re-renders only when its
// own post object (cache entries are replaced, never mutated) or these flags change.
export const PostCard = memo(function PostCard({
  post,
  viewerId,
  following,
  requested,
  actions,
  variant = 'feed',
}: PostCardProps) {
  const [burst, setBurst] = useRecyclingState(0, [post._id]);
  const author = visibleAuthor(post);
  const isOwn = isOwnPost(post, viewerId);
  const liked = isLikedBy(post, viewerId);
  const interested = (post.replies ?? []).some(
    (r) => r.text === INTEREST_TEXT && isOwnReply(r, viewerId),
  );

  const doubleTapLike = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBurst((n) => n + 1);
    actions.likeOnce(post);
  };

  return (
    <View style={styles.card}>
      <PostHeader
        post={post}
        isOwn={isOwn}
        following={following}
        requested={requested}
        onPressAuthor={() => author && actions.openProfile(String(author._id))}
        onConnect={() => actions.connect(post)}
      />

      <View style={styles.body}>
        <PostText
          postId={post._id}
          text={post.text}
          expandedByDefault={variant === 'detail'}
          burst={post.imageUrl ? 0 : burst}
          onDoubleTap={doubleTapLike}
          onPress={variant === 'feed' ? () => actions.openPost(post._id) : undefined}
        />
        {post.imageUrl ? (
          <PostImage
            url={post.imageUrl}
            burst={burst}
            onOpen={() => actions.openImage(post.imageUrl!)}
            onDoubleTap={doubleTapLike}
          />
        ) : null}
        {post.youtubeUrl ? (
          <PostVideo youtubeUrl={post.youtubeUrl} onOpen={actions.openVideo} />
        ) : null}
        {post.pdfUrl ? (
          <PostPdf
            name={post.pdfName}
            size={post.pdfSize}
            onOpen={() => actions.openPdf(post.pdfUrl!)}
          />
        ) : null}
        <PostTags tags={post.tags ?? []} />
        {post.link ? (
          <PostLink link={post.link} onOpen={() => actions.openLink(post.link)} />
        ) : null}
      </View>

      <PostActionBar
        type={post.type}
        liked={liked}
        likeCount={likeCountOf(post)}
        replyCount={replyCountOf(post)}
        interested={interested}
        onLike={() => actions.like(post)}
        onReplies={() => actions.openReplies(post, true)}
        onInterested={() => actions.interested(post)}
        onMenu={() => actions.openMenu(post)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  // later .post-card rule on the web: flat rows separated by a #1f1f1f line
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.bg,
  },
  body: { marginTop: 6 },
});
