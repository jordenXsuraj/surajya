import { useScrollToTop } from 'expo-router';
import { useRef, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/components/Logo';
import { EmptyState, Text } from '@/components/ui';
import { useTabReselect } from '@/hooks/useTabReselect';
import { colors, layout } from '@/theme/tokens';

type TabPlaceholderProps = {
  title?: string;
  emoji: string;
  heading: string;
  message: string;
  banner?: ReactNode;
  children?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
};

// Shared shell for tabs whose content arrives in later prompts. Already wired for re-tap:
// scrolls to the top (useScrollToTop) and refreshes (useTabReselect).
export function TabPlaceholder({
  title,
  emoji,
  heading,
  message,
  banner,
  children,
  refreshing = false,
  onRefresh,
}: TabPlaceholderProps) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  useScrollToTop(scrollRef);
  useTabReselect(() => onRefresh?.());

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        {title ? <Text variant="title">{title}</Text> : <Logo size="sm" />}
      </View>
      {banner}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
              progressBackgroundColor={colors.bg3}
            />
          ) : undefined
        }
      >
        <EmptyState emoji={emoji} title={heading} message={message} />
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    height: 56,
    justifyContent: 'center',
    paddingHorizontal: layout.gutter,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  content: { paddingHorizontal: layout.gutter, paddingBottom: 32 },
});
