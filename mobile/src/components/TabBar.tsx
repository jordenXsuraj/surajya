import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useRef, type ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ConnectIcon, FollowingIcon, HomeIcon, MeIcon, PostIcon } from '@/components/TabIcons';
import { Text } from '@/components/ui/Text';
import { colors, fonts, fontSize, layout } from '@/theme/tokens';

// Port of BottomNav.jsx: Home, Following, raised Post button (opens the compose modal; it is not
// a tab), Connect, Me. Re-tapping the active tab emits the standard tabPress event, which
// useScrollToTop / useTabReselect use to scroll up and refetch.

const TABS: Record<string, { label: string; Icon: ComponentType<{ active: boolean }> }> = {
  index: { label: 'Home', Icon: HomeIcon },
  following: { label: 'Following', Icon: FollowingIcon },
  connect: { label: 'Connect', Icon: ConnectIcon },
  me: { label: 'Me', Icon: MeIcon },
};

const TAP_DEBOUNCE_MS = 300; // web: navigating flag

export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const navigating = useRef(false);

  // Ignores taps for 300 ms after one was handled (double taps, taps during the transition).
  function debounced(): boolean {
    if (navigating.current) return true;
    navigating.current = true;
    setTimeout(() => {
      navigating.current = false;
    }, TAP_DEBOUNCE_MS);
    return false;
  }

  const items = state.routes
    .filter((route) => route.name in TABS)
    .map((route) => {
      const index = state.routes.indexOf(route);
      const focused = state.index === index;
      const { label, Icon } = TABS[route.name]!;

      const onPress = () => {
        if (debounced()) return;
        void Haptics.selectionAsync();
        const event = navigation.emit({
          type: 'tabPress',
          target: route.key,
          canPreventDefault: true,
        });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      };

      return (
        <Pressable
          key={route.key}
          onPress={onPress}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
          accessibilityRole="tab"
          accessibilityState={{ selected: focused }}
          accessibilityLabel={label}
          style={styles.item}
        >
          <View style={[styles.icon, focused && styles.iconActive]}>
            <Icon active={focused} />
          </View>
          <Text style={[styles.label, focused && styles.labelActive]} maxFontSizeMultiplier={1.2}>
            {label}
          </Text>
        </Pressable>
      );
    });

  const post = (
    <Pressable
      key="post"
      onPress={() => {
        if (debounced()) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/compose');
      }}
      accessibilityRole="button"
      accessibilityLabel="Create a post"
      style={styles.item}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.icon, styles.center, pressed && styles.centerPressed]}>
            <PostIcon />
          </View>
          <Text style={[styles.label, styles.centerLabel]} maxFontSizeMultiplier={1.2}>
            Post
          </Text>
        </>
      )}
    </Pressable>
  );

  items.splice(2, 0, post);

  return (
    <View
      style={[
        styles.bar,
        { height: layout.tabBarHeight + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {items}
    </View>
  );
}

const styles = StyleSheet.create({
  // .bottom-nav
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 5,
    backgroundColor: colors.navBar,
    borderTopWidth: 1,
    borderTopColor: colors.br,
  },
  // .bn-item
  item: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 4, minHeight: 60 },
  // .bn-icon
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconActive: { backgroundColor: colors.al },
  // .bn-center .bn-icon
  center: {
    width: 46,
    height: 46,
    borderRadius: 14,
    marginTop: -8,
    backgroundColor: colors.accent,
    boxShadow: `0 6px 20px ${colors.ag}`,
  },
  centerPressed: { backgroundColor: colors.accentPressed },
  // .bn-label
  label: { fontFamily: fonts.medium, fontSize: fontSize.xxs, color: colors.dim },
  labelActive: { fontFamily: fonts.bold, color: colors.accent },
  centerLabel: { color: colors.muted },
});
