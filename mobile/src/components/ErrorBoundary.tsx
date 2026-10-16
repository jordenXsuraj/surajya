import { router } from 'expo-router';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { reportError } from '@/lib/monitoring';
import { persister, queryClient } from '@/lib/queryClient';
import { usePostUi } from '@/stores/postUi.store';
import { useUiStore } from '@/stores/ui.store';
import { colors, layout } from '@/theme/tokens';

/**
 * Everything a restart throws away: cached server data (a crash caused by a bad cached answer must
 * not come back right away; it is fetched again) and open overlays. The session stays.
 */
export function resetAfterCrash(): void {
  queryClient.clear();
  void persister.removeClient();
  usePostUi.getState().reset();
  useUiStore.getState().hideToast();
}

/** "Something went wrong / Restart". Never shows the error itself (it goes to crash reporting). */
export function CrashScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.emoji}>😵</Text>
        <Text variant="title" align="center" accessibilityRole="header">
          Something went wrong
        </Text>
        <Text variant="caption" align="center">
          MeetNet ran into a problem. Restart to carry on; your account and posts are safe.
        </Text>
        <Button title="Restart" onPress={onRestart} testID="crash-restart" />
      </View>
    </SafeAreaView>
  );
}

type State = { error: Error | null };

/**
 * Wraps every screen of the root stack (`screenLayout` in app/_layout.tsx): a render error in one
 * screen shows CrashScreen there while the navigator stays, and Restart goes back to Home with
 * fresh data. Errors outside the screens reach the root layout's `ErrorBoundary` export.
 */
export class ScreenErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack ?? undefined });
  }

  restart = () => {
    resetAfterCrash();
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) return <CrashScreen onRestart={this.restart} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 14,
    paddingHorizontal: layout.gutter,
  },
  emoji: { fontSize: 44, lineHeight: 56, textAlign: 'center' },
});
