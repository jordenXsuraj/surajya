import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys } from '@/api/queryKeys';
import { FeedHeader, SearchField } from '@/components/feed/FeedHeader';
import { FeedList } from '@/components/feed/FeedList';
import { OfflineBanner } from '@/components/feed/OfflineBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Text } from '@/components/ui/Text';
import { useFeed } from '@/hooks/useFeed';
import { matchesSearch } from '@/lib/postView';
import { colors, fonts } from '@/theme/tokens';

// Port of nexusnetwork/src/pages/ConnectionFeed.jsx: posts from people you follow (never anonymous).
export default function FollowingScreen() {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const query = useFeed('following');
  const all = query.data;
  const qc = useQueryClient();
  // Who I follow can change elsewhere (a request accepted on their phone): refreshing my own
  // lists on every visit refetches this feed when they changed (applyMe in src/api/session.ts)
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.me, exact: true });
    }, [qc]),
  );
  const posts = useMemo(() => (all ?? []).filter((p) => matchesSearch(p, search)), [all, search]);

  const empty =
    (all?.length ?? 0) > 0 && search.trim() ? (
      <EmptyState
        emoji="🔍"
        title={`No results for "${search.trim()}"`}
        message="Try a different name, tag, or keyword"
        actionTitle="Clear search"
        onAction={() => setSearch('')}
      />
    ) : (
      <EmptyState
        emoji="🤝"
        title="No posts yet"
        message="Follow students to see their posts here"
        actionTitle="Find People"
        onAction={() => router.navigate('/connect')}
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FeedHeader
        center={
          <View style={styles.title}>
            <Text style={styles.heading}>Following</Text>
            <Text style={styles.sub}>Posts from people you follow</Text>
          </View>
        }
      />
      <View style={styles.searchRow}>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search by name, tag, or post…"
        />
      </View>
      <OfflineBanner />
      <FeedList
        query={query}
        posts={posts}
        queryKey={queryKeys.feed('following', 'all')}
        empty={empty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { flex: 1, paddingLeft: 8 },
  heading: { fontFamily: fonts.bold, fontSize: 13.1, color: colors.text },
  sub: { fontFamily: fonts.regular, fontSize: 10.9, color: colors.dim },
  searchRow: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 4 },
});
