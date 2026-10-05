import { StyleSheet, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { colors } from '@/theme/tokens';

/** Placeholder card while the first page loads. */
export function PostCardSkeleton({ withMedia = false }: { withMedia?: boolean }) {
  return (
    <View style={styles.card} accessibilityLabel="Loading post">
      <View style={styles.head}>
        <Skeleton width={38} height={38} radius={19} />
        <View style={styles.meta}>
          <Skeleton width="45%" height={12} />
          <Skeleton width="30%" height={9} />
        </View>
        <Skeleton width={84} height={20} radius={999} />
      </View>
      <View style={styles.lines}>
        <Skeleton width="96%" height={12} />
        <Skeleton width="88%" height={12} />
        <Skeleton width="60%" height={12} />
      </View>
      {withMedia ? <Skeleton width="100%" height={180} radius={14} /> : null}
      <View style={styles.actions}>
        <Skeleton width={58} height={30} radius={999} />
        <Skeleton width={48} height={30} radius={999} />
      </View>
    </View>
  );
}

export function FeedSkeleton() {
  return (
    <View>
      <PostCardSkeleton />
      <PostCardSkeleton withMedia />
      <PostCardSkeleton />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meta: { flex: 1, gap: 6 },
  lines: { gap: 8 },
  actions: { flexDirection: 'row', gap: 6 },
});
