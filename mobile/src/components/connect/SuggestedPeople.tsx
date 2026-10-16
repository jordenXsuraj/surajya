import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { router, useScrollToTop } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ContributorBadge } from '@/components/ContributorBadge';
import { FollowButton } from '@/components/profile/FollowButton';
import { isSeniorPerson, personRole } from '@/components/profile/PersonRowItem';
import { Avatar, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { OfflineState, waitingForNetwork } from '@/components/ui/OfflineState';
import { useFollowActions } from '@/hooks/useFollow';
import { useSuggestions } from '@/hooks/usePeople';
import { useTabReselect } from '@/hooks/useTabReselect';
import { decodeEntities } from '@/lib/text';
import { colors, fonts, layout } from '@/theme/tokens';
import type { UserCard } from '@/types/user';

const followersLabel = (n: number) => `${n} follower${n === 1 ? '' : 's'}`;

// Web Connect → Suggested: students from my college, scored by branch, year and shared skills
// (GET /users/suggestions, top 20), as cards with the follow button.
export function SuggestedPeople() {
  const insets = useSafeAreaInsets();
  const query = useSuggestions();
  const actions = useFollowActions();
  const listRef = useRef<FlashListRef<UserCard>>(null);
  const [pulling, setPulling] = useState(false);
  const refetch = query.refetch;

  useScrollToTop(listRef);
  useTabReselect(useCallback(() => void refetch(), [refetch]));

  const onPull = useCallback(async () => {
    setPulling(true);
    await refetch().catch(() => undefined);
    setPulling(false);
  }, [refetch]);

  const renderItem = useCallback(
    ({ item, index }: { item: UserCard; index: number }) => {
      const id = String(item._id);
      const name = decodeEntities(item.name);
      return (
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push(`/profile/${id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${name}'s profile`}
            style={styles.top}
          >
            <Avatar name={name} uri={item.avatar || null} size={52} colorIndex={index} />
            <View style={styles.info}>
              <View style={styles.nameLine}>
                <Text style={styles.name} numberOfLines={1}>
                  {name}
                </Text>
                {item.isContributor ? <ContributorBadge size={16} /> : null}
                {isSeniorPerson(item) ? <Text style={styles.senior}>🎓 Senior</Text> : null}
              </View>
              <Text style={styles.role} numberOfLines={1}>
                {personRole(item)}
              </Text>
              {item.bio ? (
                <Text style={styles.bio} numberOfLines={2}>
                  {decodeEntities(item.bio)}
                </Text>
              ) : null}
            </View>
          </Pressable>
          {item.skills.length ? (
            <View style={styles.skills}>
              {item.skills.slice(0, 4).map((s) => (
                <View key={s} style={styles.skill}>
                  <Text style={styles.skillText}>{decodeEntities(s)}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <View style={styles.bottom}>
            <Text style={styles.followers}>{followersLabel(item.followerCount || 0)}</Text>
            <FollowButton id={id} name={name} actions={actions} compact />
          </View>
        </View>
      );
    },
    [actions],
  );

  if (waitingForNetwork(query)) return <OfflineState onRetry={() => void query.refetch()} />;
  if (query.isPending)
    return (
      <View style={styles.skeletons}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={150} radius={16} />
        ))}
      </View>
    );
  if (query.isError && !query.data)
    return <ErrorState error={query.error} onRetry={() => void refetch()} />;

  const people = query.data ?? [];

  return (
    <FlashList
      ref={listRef}
      data={people}
      keyExtractor={(u) => String(u._id)}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      ListHeaderComponent={
        people.length ? (
          <Text style={styles.hint}>Based on your branch, year and skills</Text>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          emoji="💡"
          title="No suggestions yet"
          message="When more students from your college join, they show up here."
        />
      }
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={onPull}
          tintColor={colors.accent}
          colors={[colors.accent]}
          progressBackgroundColor={colors.bg3}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  skeletons: { paddingHorizontal: layout.gutter, gap: 12, paddingTop: 12 },
  hint: {
    paddingHorizontal: layout.gutter,
    paddingTop: 12,
    paddingBottom: 8,
    fontFamily: fonts.regular,
    fontSize: 11.5,
    color: colors.dim,
  },
  card: {
    marginHorizontal: layout.gutter,
    marginBottom: 12,
    padding: 14,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.extrabold, fontSize: 15, color: colors.text },
  senior: { marginLeft: 6, fontFamily: fonts.semibold, fontSize: 10.2, color: colors.yellow },
  role: { fontFamily: fonts.regular, fontSize: 11.4, color: colors.dim, marginTop: 2 },
  bio: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 4,
  },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  skill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.br,
  },
  skillText: { fontFamily: fonts.semibold, fontSize: 10.2, color: colors.muted },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  followers: { fontFamily: fonts.regular, fontSize: 11, color: colors.dim },
});
