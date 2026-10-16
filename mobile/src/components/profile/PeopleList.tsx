import type { UseQueryResult } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BackButton } from '@/components/BackButton';
import { PersonRowItem } from '@/components/profile/PersonRowItem';
import { EmptyState, ErrorState, Input, Skeleton, Text } from '@/components/ui';
import { OfflineState, waitingForNetwork } from '@/components/ui/OfflineState';
import { useFollowActions, useUnblockUser } from '@/hooks/useFollow';
import { decodeEntities } from '@/lib/text';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, layout } from '@/theme/tokens';
import type { PersonRow } from '@/types/user';

type PeopleListProps = {
  title: string;
  query: Pick<
    UseQueryResult<PersonRow[], unknown>,
    'data' | 'isPending' | 'isError' | 'error' | 'refetch' | 'fetchStatus'
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
// on every row, a search box over the list, pull-to-refresh. Rows: PersonRowItem.
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
    ({ item, index }: { item: PersonRow; index: number }) => (
      <PersonRowItem
        person={item}
        index={index}
        myId={myId}
        mode={mode}
        actions={actions}
        onUnblock={unblock}
      />
    ),
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
      {waitingForNetwork(query) ? (
        <OfflineState onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
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
});
