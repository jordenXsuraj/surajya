import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useScrollToTop } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PagingFooter } from '@/components/connect/PagingFooter';
import { PersonRowItem } from '@/components/profile/PersonRowItem';
import { Chip, EmptyState, ErrorState, Skeleton, Text } from '@/components/ui';
import { OfflineState, waitingForNetwork } from '@/components/ui/OfflineState';
import { useFollowActions } from '@/hooks/useFollow';
import { useDebounced, usePeopleSearch } from '@/hooks/usePeople';
import { useTabReselect } from '@/hooks/useTabReselect';
import { SKILL_FILTERS, type PeopleScope, type SkillFilter } from '@/lib/people';
import { useAuthStore } from '@/stores/auth.store';
import { colors, fonts, layout, radius, touch } from '@/theme/tokens';
import type { UserCard } from '@/types/user';

const SCOPES: { key: PeopleScope; label: string }[] = [
  { key: 'campus', label: '🏫 My college' },
  { key: 'all', label: '🌐 All colleges' },
];

// Web Connect → Find: search (300 ms debounce), My college / All, the skill pills, then the
// students 20 at a time. The next page loads by itself near the end (the web has "Load More").
export function FindPeople() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<PeopleScope>('campus');
  const [skill, setSkill] = useState<SkillFilter>('All');
  const debounced = useDebounced(search);
  const query = usePeopleSearch(scope, debounced, skill);
  const { people, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  const actions = useFollowActions();
  const myId = useAuthStore((s) => s.user?._id ?? '');
  const listRef = useRef<FlashListRef<UserCard>>(null);
  const [pulling, setPulling] = useState(false);

  useScrollToTop(listRef);
  // A new search or filter is a new list: start it at the top
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [scope, skill, debounced]);
  const refetch = query.refetch;
  useTabReselect(useCallback(() => void refetch(), [refetch]));

  const onPull = useCallback(async () => {
    setPulling(true);
    await refetch().catch(() => undefined);
    setPulling(false);
  }, [refetch]);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const renderItem = useCallback(
    ({ item, index }: { item: UserCard; index: number }) => (
      <PersonRowItem person={item} index={index} myId={myId} actions={actions} />
    ),
    [myId, actions],
  );

  return (
    <View style={styles.root}>
      <View style={styles.controls}>
        <View style={styles.search}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or username"
            placeholderTextColor={colors.dim}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search students"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={touch.hitSlop}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filters}
        >
          {SCOPES.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              selected={scope === s.key}
              onPress={() => setScope(s.key)}
              accessibilityLabel={s.key === 'campus' ? 'My college only' : 'All colleges'}
            />
          ))}
          <View style={styles.divider} />
          {SKILL_FILTERS.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={skill === s}
              onPress={() => setSkill(s)}
              accessibilityLabel={s === 'All' ? 'Any skill' : `Skill ${s}`}
            />
          ))}
        </ScrollView>
      </View>

      {waitingForNetwork(query) ? (
        <OfflineState onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <View style={styles.skeletons}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={72} radius={16} />
          ))}
        </View>
      ) : query.isError && people.length === 0 ? (
        <ErrorState error={query.error} onRetry={() => void refetch()} />
      ) : (
        <FlashList
          ref={listRef}
          data={people}
          keyExtractor={(u) => String(u._id)}
          renderItem={renderItem}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          // Off: when the results change (another skill, scope or search), FlashList kept the row
          // that was on screen in place, so the new list opened scrolled to its middle
          maintainVisibleContentPosition={{ disabled: true }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24 }}
          ListEmptyComponent={
            <EmptyState
              emoji="🔍"
              title="No students found"
              message={
                debounced.trim() || skill !== 'All'
                  ? 'Try a different search or skill.'
                  : scope === 'campus'
                    ? 'No one from your college has joined yet. Try All colleges.'
                    : 'No students yet.'
              }
            />
          }
          ListFooterComponent={
            <PagingFooter
              count={people.length}
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              isFetchNextPageError={isFetchNextPageError}
              fetchNextPage={fetchNextPage}
              doneText="All students loaded ✓"
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  controls: { gap: 10, paddingTop: 10, paddingBottom: 8 },
  search: {
    height: 42,
    marginHorizontal: layout.gutter,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.bg3,
  },
  searchIcon: { fontSize: 12.5 },
  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.regular,
    fontSize: 13.6,
    color: colors.text,
  },
  clear: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, paddingHorizontal: 2 },
  filters: { gap: 6, paddingHorizontal: layout.gutter, alignItems: 'center' },
  divider: { width: 1, height: 22, backgroundColor: colors.br2, marginHorizontal: 2 },
  skeletons: { paddingHorizontal: layout.gutter, gap: 10, paddingTop: 8 },
});
