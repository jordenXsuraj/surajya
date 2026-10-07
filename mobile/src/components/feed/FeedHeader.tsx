import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Logo } from '@/components/Logo';
import { Text } from '@/components/ui/Text';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { colors, fonts, radius, touch } from '@/theme/tokens';

type FeedHeaderProps = {
  search?: string;
  onSearch?: (text: string) => void;
  placeholder?: string;
  /** Replaces the search field (Following: title + subtitle). */
  center?: ReactNode;
};

// .home-header: logo · search · notifications bell with the unread badge.
export function FeedHeader({
  search = '',
  onSearch,
  placeholder = 'Search posts, tags…',
  center,
}: FeedHeaderProps) {
  return (
    <View style={styles.header}>
      <Logo size="sm" />
      {center ??
        (onSearch ? (
          <SearchField value={search} onChange={onSearch} placeholder={placeholder} />
        ) : null)}
      <Bell />
    </View>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.search}>
      <Svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.muted}
        strokeWidth={2}
      >
        <Circle cx="11" cy="11" r="8" />
        <Path d="m21 21-4.35-4.35" />
      </Svg>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.dim}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        returnKeyType="search"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={styles.searchInput}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={touch.hitSlop}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
        >
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function Bell() {
  const unread = useUnreadCount();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={touch.hitSlop}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      style={styles.bell}
    >
      <Svg
        width={22}
        height={22}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.muted}
        strokeWidth={1.8}
      >
        <Path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </Svg>
      {unread > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.1}>
            {unread > 9 ? '9+' : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
    backgroundColor: colors.bg,
    minHeight: 56,
  },
  search: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.br,
    backgroundColor: colors.bg3,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    fontFamily: fonts.regular,
    fontSize: 13.1,
    color: colors.text,
  },
  clear: { fontFamily: fonts.regular, fontSize: 12.5, color: colors.muted, paddingHorizontal: 2 },
  bell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 9, color: colors.white, lineHeight: 11 },
});
