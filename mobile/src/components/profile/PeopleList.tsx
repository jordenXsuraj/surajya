import type { UseQueryResult } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileButton } from '@/components/profile/ProfileButton';
import { Avatar, EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { useFollowActions, useUnblockUser } from '@/hooks/useFollow';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, layout, touch } from '@/theme/tokens';
import type { PersonRow } from '@/types/user';

type PeopleListProps = {
  title: string;
  query: Pick<
    UseQueryResult<PersonRow[], unknown>,
    'data' | 'isPending' | 'isError' | 'error' | 'refetch'
  >;
  /** follow: rows have the follow button; blocked: rows have Unblock and don't open profiles. */
  mode?: 'follow' | 'blocked';
  empty: { emoji: string; title: string; message?: string };
};

/** Search in the loaded list: name, @username, branch, college or a skill. */
export function matchesPerson(person: PersonRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [person.name, person.username, person.branch, person.college, ...(person.skills ?? [])]
    .filter(Boolean)
    .some((field) => decodeEntities(field).toLowerCase().includes(q));
}

// Followers / following (mine or someone's), follow requests, blocked users. Web PeopleSheet rows
// (avatar, name, "3rd yr CS · College", up to 3 skills) plus what the web lacks: the follow button
// on every row, a search box over the list, pull-to-refresh.
export function PeopleList({ title, query, mode = 'follow', empty }: PeopleListProps) {
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();
  const actions = useFollowActions();
  const { mutate: unblock } = useUnblockUser();
  const myId = useAuthStore((s) => s.user?._id ?? '');
  const [pulling, setPulling] = useState(false);

  const people = useMemo(
    () => (query.data ?? []).filter((p) => matchesPerson(p, search)),
    [query.data, search],
  );

  const onPull = useCallback(async () => {
    setPulling(true);
    await query.refetch().catch(() => undefined);
    setPulling(false);
  }, [query]);

  const renderItem = useCallback(
    ({ item, index }: { item: PersonRow; index: number }) => {
      const id = String(item._id);
      const name = decodeEntities(item.name);
      const open =
        mode === 'blocked'
          ? undefined
          : () => (id === myId ? router.navigate('/me') : router.push(`/profile/${id}`));
      return (
        <View style={styles.row}>
          <Pressable
            onPress={open}
            disabled={!open}
            accessibilityRole={open ? 'button' : undefined}
            accessibilityLabel={open ? `Open ${name}'s profile` : name}
            style={styles.person}
          >
            <Avatar name={name} uri={item.avatar || null} size={44} colorIndex={index} />
            <View style={styles.info}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              {item.year || item.branch || item.college ? (
                <Text style={styles.role} numberOfLines={1}>
                  {[
                    [item.year && `${item.year} yr`, item.branch].filter(Boolean).join(' '),
                    item.college && decodeEntities(item.college),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              ) : item.username ? (
                <Text style={styles.role}>@{item.username}</Text>
              ) : null}
              {item.skills?.length ? (
                <View style={styles.skills}>
                  {item.skills.slice(0, 3).map((s) => (
                    <View key={s} style={styles.skill}>
                      <Text style={styles.skillText}>{decodeEntities(s)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </Pressable>
          {mode === 'blocked' ? (
            <ProfileButton
              label="Unblock"
              a11y={`Unblock ${name}`}
              kind="secondary"
              compact
              onPress={() =>
                Alert.alert(
                  `Unblock ${name.split(' ')[0]}?`,
                  "You'll see each other's posts and profiles again. Follows that were removed don't come back.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Unblock', onPress: () => unblock({ id, name }) },
                  ],
                )
              }
            />
          ) : (
            <FollowButton id={id} name={name} actions={actions} compact />
          )}
        </View>
      );
    },
    [mode, myId, actions, unblock],
  );

  const list = query.data ?? [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <BackButton />
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.topBarEnd} />
      </View>
      {list.length > 0 ? (
        <View style={styles.search}>
          <Input
            placeholder="Search by name, branch, college or skill"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      ) : null}
      {query.isPending ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={64} radius={16} />
          ))}
        </View>
      ) : query.isError && list.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <FlashList
          data={people}
          keyExtractor={(p) => String(p._id)}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            list.length > 0 ? (
              <EmptyState emoji="🔍" title="No one matches" message="Try another name or skill." />
            ) : (
              <EmptyState emoji={empty.emoji} title={empty.title} message={empty.message} />
            )
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
      )}
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
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.text },
  topBarEnd: { width: 52 },
  search: { paddingHorizontal: layout.gutter, paddingBottom: 8 },
  skeletons: { paddingHorizontal: layout.gutter, gap: 10, paddingTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: layout.gutter,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  info: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.text },
  role: { fontFamily: fonts.regular, fontSize: 11.4, color: colors.dim, marginTop: 2 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  skill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.br,
  },
  skillText: { fontFamily: fonts.semibold, fontSize: 10.2, color: colors.muted },
});
