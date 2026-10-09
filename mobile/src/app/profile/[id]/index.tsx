import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError } from '@/api/errors';
import { queryKeys } from '@/api/queryKeys';
import { BackButton } from '@/components/BackButton';
import { FeedSkeleton } from '@/components/post/PostCardSkeleton';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileList, type ProfileRow } from '@/components/profile/ProfileList';
import { ProfileSections } from '@/components/profile/ProfileSections';
import { ProfileTabs, type ProfileTab } from '@/components/profile/ProfileTabs';
import { EmptyState, ErrorState, Text } from '@/components/ui';
import { useFollowActions } from '@/hooks/useFollow';
import { useUser, useUserPosts } from '@/hooks/useProfile';
import { mediaSections } from '@/lib/media';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';

/** GET /users/:id/posts returns at most 50 (no paging). */
const USER_POSTS_LIMIT = 50;

// Someone's profile (also the App Link target themeetnet.com/profile/:id) — web StudentProfile.jsx:
// the same header as Me with the follow button (src/lib/follow.ts), ⋯ → Share / Report / Block,
// and Posts (their named posts) / Media. A 404 (deleted, or a block either way) shows "This
// profile isn't available"; my own id opens the Me tab.
export default function ProfileScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const myId = useAuthStore((s) => s.user?._id ?? '');
  const isMe = id === myId;
  const qc = useQueryClient();
  const profile = useUser(isMe ? '' : id);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const posts = useUserPosts(id, !isMe);
  const actions = useFollowActions();
  const insets = useSafeAreaInsets();

  // The follow button comes from my own lists: refresh them (and the profile) when shown again
  useFocusEffect(
    useCallback(() => {
      if (!id || isMe) return;
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
      void qc.invalidateQueries({ queryKey: queryKeys.user(id) });
    }, [qc, id, isMe]),
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: queryKeys.me, exact: true }),
      qc.refetchQueries({ queryKey: queryKeys.userAll(id) }),
    ]).catch(() => undefined);
  }, [qc, id]);

  if (isMe) return <Redirect href="/me" />;

  const gone =
    profile.error instanceof ApiError &&
    (profile.error.status === 404 || profile.error.status === 400);

  const topBar = (
    <View style={styles.topBar}>
      <BackButton />
      {profile.data ? (
        <Pressable
          onPress={() =>
            usePostUi
              .getState()
              .openUserMenu({ id, name: decodeEntities(profile.data?.name ?? '') })
          }
          accessibilityRole="button"
          accessibilityLabel="More: share, report, block"
          hitSlop={touch.hitSlop}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={styles.moreText}>⋯</Text>
        </Pressable>
      ) : null}
    </View>
  );

  if (!profile.data) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {topBar}
        {gone ? (
          <EmptyState
            emoji="🚫"
            title="This profile isn't available"
            message="The link may be wrong, or the account is no longer visible to you."
          />
        ) : profile.isError ? (
          <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
        ) : (
          <ActivityIndicator style={styles.loading} color={colors.muted} />
        )}
      </View>
    );
  }

  const user = profile.data;
  const name = decodeEntities(user.name);
  const postList = posts.data ?? [];
  const postsLabel = posts.data
    ? `${postList.length}${postList.length >= USER_POSTS_LIMIT ? '+' : ''}`
    : '–';
  const { videos, instagram } = mediaSections(user.mediaItems);
  const mediaCount = videos.length + instagram.length;

  const header = (
    <View>
      <ProfileHeader
        profile={user}
        isMe={false}
        postsLabel={postsLabel}
        onPressPosts={() => setTab('posts')}
        onPressFollowing={() =>
          router.push({ pathname: '/profile/[id]/following', params: { id } })
        }
        onPressFollowers={() =>
          router.push({ pathname: '/profile/[id]/followers', params: { id } })
        }
        onViewAvatar={user.avatar ? () => usePostUi.getState().openImage(user.avatar!) : undefined}
        actions={<FollowButton id={id} name={name} actions={actions} />}
      />
      <ProfileSections profile={user} isMe={false} />
      <ProfileTabs
        current={tab}
        onChange={setTab}
        tabs={[
          { key: 'posts', label: `Posts (${postsLabel})` },
          { key: 'media', label: `Media 🎬${mediaCount > 0 ? ` (${mediaCount})` : ''}` },
        ]}
      />
    </View>
  );

  let rows: ProfileRow[];
  if (tab === 'media') rows = [{ kind: 'media', items: user.mediaItems }];
  else if (posts.isPending) rows = [{ kind: 'state', key: 'loading', node: <FeedSkeleton /> }];
  else if (posts.isError)
    rows = [
      {
        kind: 'state',
        key: 'error',
        node: <ErrorState error={posts.error} onRetry={() => void posts.refetch()} />,
      },
    ];
  else if (postList.length === 0)
    rows = [
      {
        kind: 'state',
        key: 'empty',
        node: <EmptyState emoji="📝" title="No public posts yet" />,
      },
    ];
  else rows = postList.map((post) => ({ kind: 'post', post }));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {topBar}
      <ProfileList
        header={header}
        rows={rows}
        isOwn={false}
        refreshing={profile.isRefetching}
        onRefresh={() => void refresh()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.gutter,
  },
  more: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  moreText: { fontFamily: fonts.black, fontSize: 22, color: colors.muted },
  pressed: { opacity: 0.6 },
  loading: { marginTop: 40 },
});
