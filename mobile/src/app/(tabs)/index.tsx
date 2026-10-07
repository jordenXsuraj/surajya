import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { queryKeys, type FeedType } from '@/api/queryKeys';
import { ActiveFilters } from '@/components/feed/ActiveFilters';
import { CategoryBar, type HomeScope } from '@/components/feed/CategoryBar';
import { FeedHeader } from '@/components/feed/FeedHeader';
import { FeedList } from '@/components/feed/FeedList';
import { OfflineBanner } from '@/components/feed/OfflineBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
import { useFeed } from '@/hooks/useFeed';
import { matchesSearch } from '@/lib/postView';
import { usePostUi } from '@/stores/postUi.store';
import { colors } from '@/theme/tokens';

const DEFAULT_SCOPE: HomeScope = 'global'; // web Home.jsx: useState('global')

// Port of nexusnetwork/src/pages/Home.jsx.
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<HomeScope>(DEFAULT_SCOPE);
  const [category, setCategory] = useState<FeedType>('all');
  const [search, setSearch] = useState('');
  const homeTopSignal = usePostUi((s) => s.homeTopSignal);
  const query = useFeed(scope, category);
  const posts = useMemo(
    () => (query.data ?? []).filter((p) => matchesSearch(p, search)),
    [query.data, search],
  );

  const empty = search.trim() ? (
    <EmptyState
      emoji="🔍"
      title={`No results for "${search.trim()}"`}
      message="Try a different name, tag, or keyword"
      actionTitle="Clear search"
      onAction={() => setSearch('')}
    />
  ) : (
    <EmptyState
      emoji="📭"
      title="Nothing here yet"
      message={scope === 'global' ? 'No posts from other colleges yet' : 'Be the first to post!'}
      actionTitle={category !== 'all' || scope === 'global' ? 'Show all posts' : undefined}
      onAction={() => {
        // web: back to every type, my college
        setCategory('all');
        setScope('college');
      }}
    />
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FeedHeader search={search} onSearch={setSearch} />
      <CategoryBar scope={scope} onScope={setScope} category={category} onCategory={setCategory} />
      <ActiveFilters
        scope={scope}
        category={category}
        defaultScope={DEFAULT_SCOPE}
        onClear={() => {
          setCategory('all');
          setScope(DEFAULT_SCOPE);
        }}
      />
      <OfflineBanner />
      <VerifyEmailBanner />
      <FeedList
        query={query}
        posts={posts}
        queryKey={queryKeys.feed(scope, category)}
        empty={empty}
        scrollSignal={homeTopSignal}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
