import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, fonts } from '@/theme/tokens';

type PagingFooterProps = {
  count: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
  /** Shown under a complete list (web: "All students loaded ✓"). */
  doneText?: string;
};

/** Loading more… / tap to retry / end-of-list line under an infinite list. */
export function PagingFooter({
  count,
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  doneText,
}: PagingFooterProps) {
  if (isFetchingNextPage)
    return (
      <View style={styles.footer}>
        <ActivityIndicator color={colors.muted} />
        <Text style={styles.text}>Loading…</Text>
      </View>
    );
  if (isFetchNextPageError)
    return (
      <Pressable
        onPress={() => void fetchNextPage()}
        accessibilityRole="button"
        style={styles.footer}
      >
        <Text style={styles.text}>Couldn't load more. Tap to try again.</Text>
      </Pressable>
    );
  if (!hasNextPage && count > 0 && doneText)
    return (
      <View style={styles.footer}>
        <Text style={styles.text}>{doneText}</Text>
      </View>
    );
  return null;
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 16 },
  text: { fontFamily: fonts.regular, fontSize: 11.5, color: colors.dim },
});
