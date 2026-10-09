import type { FlashListRef } from '@shopify/flash-list';
import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/api/queryKeys';
import { FeedSkeleton } from '@/components/post/PostCardSkeleton';
import { ProfileButton } from '@/components/profile/ProfileButton';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileList, type ProfileRow } from '@/components/profile/ProfileList';
import { ProfileSections } from '@/components/profile/ProfileSections';
import { ProfileTabs, type ProfileTab } from '@/components/profile/ProfileTabs';
import { EmptyState, ErrorState, Text } from '@/components/ui';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
import { useMe } from '@/hooks/useMe';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useMyPosts, useMySaved } from '@/hooks/useProfile';
import { useTabReselect } from '@/hooks/useTabReselect';
import type { PhotoKind } from '@/lib/crop';
import { mediaSections } from '@/lib/media';
import { shareProfile } from '@/lib/profile';
import { useAuthStore } from '@/stores/auth.store';
import { usePostUi } from '@/stores/postUi.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';

// Me — web Profile.jsx: cover + photo (tap 📷 to change: pick → crop → upload with progress),
// name, @username, bio, tags, Posts · Following › · Followers ›, Edit profile / Share, follow
// requests, Skills / Projects / Roadmap, then Posts / Media / Saved. Settings (⚙) has the
// account things and Log out.
export default function MeScreen() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const me = useMe();
  const [tab, setTab] = useState<ProfileTab>('posts');
  const posts = useMyPosts();
  const saved = useMySaved(tab === 'saved');
  const photo = useProfilePhoto();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlashListRef<ProfileRow>>(null);

  const refresh = useCallback(async () => {
    await Promise.all([
      qc.refetchQueries({ queryKey: queryKeys.me, exact: true }),
      qc.refetchQueries({ queryKey: tab === 'saved' ? queryKeys.mySaved : queryKeys.myPosts }),
    ]).catch(() => undefined);
  }, [qc, tab]);

  useScrollToTop(listRef);
  useTabReselect(refresh);
  // Counts and requests change on other screens and devices: refresh when the tab shows again
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
    }, [qc]),
  );

  if (!user) return null;

  const postList = posts.data ?? [];
  const postsLabel = `${postList.length}${posts.hasNextPage ? '+' : ''}`;
  const { videos, instagram } = mediaSections(user.mediaItems);
  const mediaCount = videos.length + instagram.length;
  const savedList = saved.data ?? [];
  const requests = user.incomingRequestIds.length;

  function changePhoto(kind: PhotoKind) {
    Alert.alert(kind === 'avatar' ? 'Profile photo' : 'Cover photo', undefined, [
      { text: 'Take photo', onPress: () => void photo.choose(kind, 'camera') },
      { text: 'Choose from library', onPress: () => void photo.choose(kind, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const failed = (['avatar', 'cover'] as const).find((k) => photo.uploads[k]?.status === 'error');
  const failedUpload = failed ? photo.uploads[failed] : undefined;

  const header = (
    <View>
      <ProfileHeader
        profile={user}
        isMe
        postsLabel={postsLabel}
        onPressPosts={() => setTab('posts')}
        onPressFollowing={() => router.push('/me/following')}
        onPressFollowers={() => router.push('/me/followers')}
        avatarUpload={photo.uploads.avatar}
        coverUpload={photo.uploads.cover}
        onEditAvatar={() => changePhoto('avatar')}
        onEditCover={() => changePhoto('cover')}
        onViewAvatar={() => user.avatar && usePostUi.getState().openImage(user.avatar)}
        actions={
          <>
            <ProfileButton
              label="Edit profile"
              kind="secondary"
              onPress={() => router.push('/me/edit')}
            />
            <ProfileButton
              label="Share"
              a11y="Share your profile"
              kind="primary"
              onPress={() => void shareProfile(String(user._id), user.name)}
            />
          </>
        }
      />
      {failed && failedUpload?.status === 'error' ? (
        <View style={styles.uploadError}>
          <Text style={styles.uploadErrorText} numberOfLines={2}>
            ❌ {failed === 'avatar' ? 'Photo' : 'Cover'} not uploaded: {failedUpload.message}
          </Text>
          <Pressable
            onPress={() => photo.retry(failed)}
            accessibilityRole="button"
            hitSlop={touch.hitSlop}
          >
            <Text style={styles.retry}>↻ Retry</Text>
          </Pressable>
          <Pressable
            onPress={() => photo.dismissError(failed)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={touch.hitSlop}
          >
            <Text style={styles.dismiss}>✕</Text>
          </Pressable>
        </View>
      ) : null}
      <VerifyEmailBanner />
      {requests > 0 ? (
        <Pressable
          onPress={() => router.push('/me/requests')}
          accessibilityRole="button"
          style={({ pressed }) => [styles.requests, pressed && styles.pressed]}
        >
          <Text style={styles.requestsText}>🤝 Follow requests ({requests})</Text>
          <Text style={styles.requestsArrow}>›</Text>
        </Pressable>
      ) : null}
      <ProfileSections profile={user} isMe onEdit={() => router.push('/me/edit')} />
      <ProfileTabs
        current={tab}
        onChange={setTab}
        tabs={[
          { key: 'posts', label: `Posts (${postsLabel})` },
          { key: 'media', label: `Media 🎬${mediaCount > 0 ? ` (${mediaCount})` : ''}` },
          { key: 'saved', label: `🔖 Saved${saved.data ? ` (${savedList.length})` : ''}` },
        ]}
      />
    </View>
  );

  let rows: ProfileRow[];
  if (tab === 'media') {
    rows = [{ kind: 'media', items: user.mediaItems }];
  } else {
    const query = tab === 'posts' ? posts : saved;
    const list = tab === 'posts' ? postList : savedList;
    if (query.isPending) rows = [{ kind: 'state', key: 'loading', node: <FeedSkeleton /> }];
    else if (query.isError && list.length === 0)
      rows = [
        {
          kind: 'state',
          key: 'error',
          node: <ErrorState error={query.error} onRetry={() => void query.refetch()} />,
        },
      ];
    else if (list.length === 0)
      rows = [
        {
          kind: 'state',
          key: 'empty',
          node: (
            <EmptyState
              emoji={tab === 'posts' ? '📝' : '🔖'}
              title={tab === 'posts' ? 'No posts yet.' : 'No saved posts yet.'}
              message={
                tab === 'posts'
                  ? 'Your posts show up here.'
                  : 'Save a post from its ⋯ menu to find it here.'
              }
            />
          ),
        },
      ];
    else rows = list.map((post) => ({ kind: 'post', post }));
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Profile</Text>
        <Pressable
          onPress={() => router.push('/me/settings')}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={touch.hitSlop}
          style={({ pressed }) => [styles.gear, pressed && styles.pressed]}
        >
          <Text style={styles.gearText}>⚙️</Text>
        </Pressable>
      </View>
      <ProfileList
        listRef={listRef}
        header={header}
        rows={rows}
        isOwn
        onAddMedia={() => router.push('/me/edit')}
        onEndReached={() => {
          if (tab === 'posts' && posts.hasNextPage && !posts.isFetchingNextPage) {
            void posts.fetchNextPage();
          }
        }}
        footer={
          tab === 'posts' && posts.isFetchingNextPage ? (
            <ActivityIndicator style={styles.more} color={colors.muted} />
          ) : null
        }
        refreshing={me.isRefetching && !me.isPending}
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
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  gear: { width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' },
  gearText: { fontSize: 20 },
  pressed: { opacity: 0.6 },
  uploadError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 15,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.al,
  },
  uploadErrorText: { flex: 1, fontFamily: fonts.medium, fontSize: 12, color: colors.text },
  retry: { fontFamily: fonts.bold, fontSize: 12.5, color: colors.accent },
  dismiss: { fontSize: 13, color: colors.muted },
  requests: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.min + 4,
    marginHorizontal: 15,
    marginBottom: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.ag,
    backgroundColor: colors.al,
  },
  requestsText: { fontFamily: fonts.bold, fontSize: 13.5, color: colors.text },
  requestsArrow: { fontFamily: fonts.bold, fontSize: 18, color: colors.accent },
  more: { paddingVertical: 20 },
});
