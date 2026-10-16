import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { FullWindowOverlay } from 'react-native-screens';

import { refreshSession } from '@/api/session';
import { MaintenanceScreen, UpdateRequiredScreen, useAppGate } from '@/components/AppGate';
import { EmailNotVerifiedSheet } from '@/components/EmailNotVerifiedSheet';
import { CrashScreen, resetAfterCrash, ScreenErrorBoundary } from '@/components/ErrorBoundary';
import { ImageViewer } from '@/components/post/ImageViewer';
import { PostMenuSheet } from '@/components/post/PostMenuSheet';
import { ProfileMenuSheet } from '@/components/profile/ProfileMenuSheet';
import { AcceptTermsScreen, useNeedsTerms } from '@/components/TermsGate';
import { RepliesSheet } from '@/components/post/RepliesSheet';
import { ReplyMenuSheet } from '@/components/post/ReplyMenuSheet';
import { ReportSheet } from '@/components/post/ReportSheet';
import { YouTubeModal } from '@/components/post/YouTubeModal';
import { ToastHost } from '@/components/ui';
import { PushBannerHost } from '@/components/ui/PushBanner';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { initMonitoring, reportError } from '@/lib/monitoring';
import { whenIdle } from '@/lib/startup';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { setupReactQueryNative } from '@/lib/reactQueryNative';
import { loadAppConfig } from '@/stores/appConfig.store';
import { bootstrapAuth, useAuthStore } from '@/stores/auth.store';
import { fontAssets } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import type { ErrorBoundaryProps } from 'expo-router';

void SplashScreen.preventAutoHideAsync();

// Synchronous: token from SecureStore + cached user from MMKV, so the first render already
// knows which stack to show (no loading screen, cold-start deep links keep working).
// The remote config waits until the first screens are on (RootLayout).
bootstrapAuth();
initMonitoring();
setupReactQueryNative();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.br,
    notification: colors.accent,
  },
};

// Overlays are mounted once, after the navigator. iOS native modals (compose) cover that root
// view, so there they go into a FullWindowOverlay (sheets use the same via containerComponent).
function Overlay({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'ios') return children;
  return <FullWindowOverlay>{children}</FullWindowOverlay>;
}

function Toasts() {
  return (
    <Overlay>
      <ToastHost />
      <PushBannerHost />
    </Overlay>
  );
}

// Forced update / maintenance (GET /api/app/config) cover the whole app; the navigation state
// underneath stays, so the app continues where it was once the gate lifts.
function Gate() {
  const gate = useAppGate();
  if (!gate) return null;
  return (
    <Overlay>
      <View style={StyleSheet.absoluteFill}>
        {gate === 'update' ? <UpdateRequiredScreen /> : <MaintenanceScreen />}
      </View>
    </Overlay>
  );
}

// Accounts that never accepted the terms (created before they existed) must accept them first.
// Below the forced-update / maintenance gate, above everything else.
function TermsGate() {
  const needsTerms = useNeedsTerms();
  if (!needsTerms) return null;
  return (
    <Overlay>
      <View style={StyleSheet.absoluteFill}>
        <AcceptTermsScreen />
      </View>
    </Overlay>
  );
}

function PushNotifications() {
  usePushNotifications();
  return null;
}

// Each screen of the stack gets its own boundary (components/ErrorBoundary.tsx)
const screenLayout = ({ children }: { children: ReactNode }) => (
  <ScreenErrorBoundary>{children}</ScreenErrorBoundary>
);

/**
 * A crash outside the screens (this layout, an overlay, a provider) replaces the whole app
 * (expo-router renders this export instead of the layout); Restart mounts the layout again.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
    void SplashScreen.hideAsync();
  }, [error]);
  return (
    <CrashScreen
      onRestart={() => {
        resetAfterCrash();
        void retry();
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const status = useAuthStore((s) => s.status);
  const signedIn = status === 'signedIn';
  const ready = fontsLoaded || Boolean(fontError);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // Not needed for the first frames: GET /app/config once the app has rendered and is idle
  useEffect(() => {
    if (ready) return whenIdle(loadAppConfig);
  }, [ready]);

  // Refresh the cached user in the background on every start and sign-in.
  useEffect(() => {
    if (signedIn) void refreshSession();
  }, [signedIn]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
          <ThemeProvider value={navigationTheme}>
            <BottomSheetModalProvider>
              <StatusBar style="light" />
              <Stack
                screenLayout={screenLayout}
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Protected guard={signedIn}>
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="compose"
                    options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                  />
                  <Stack.Screen name="post/[id]" />
                  <Stack.Screen name="profile/[id]/index" />
                  <Stack.Screen name="profile/[id]/followers" />
                  <Stack.Screen name="profile/[id]/following" />
                  <Stack.Screen name="me/edit" />
                  <Stack.Screen name="me/settings" />
                  <Stack.Screen name="me/change-password" />
                  <Stack.Screen name="me/blocked" />
                  <Stack.Screen name="me/delete-account" />
                  <Stack.Screen name="me/followers" />
                  <Stack.Screen name="me/following" />
                  <Stack.Screen name="me/requests" />
                  <Stack.Screen
                    name="crop"
                    options={{
                      presentation: 'fullScreenModal',
                      animation: 'slide_from_bottom',
                      gestureEnabled: false,
                    }}
                  />
                  <Stack.Screen name="verify-email" />
                  <Stack.Screen name="notifications" />
                  <Stack.Screen
                    name="push-prompt"
                    options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
                  />
                </Stack.Protected>
                <Stack.Protected guard={!signedIn}>
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                </Stack.Protected>
              </Stack>
              {signedIn ? (
                <>
                  <RepliesSheet />
                  <PostMenuSheet />
                  <ReplyMenuSheet />
                  <ProfileMenuSheet />
                  <ReportSheet />
                  <ImageViewer />
                  <YouTubeModal />
                </>
              ) : null}
              <EmailNotVerifiedSheet />
              <PushNotifications />
              <TermsGate />
              <Gate />
              <Toasts />
            </BottomSheetModalProvider>
          </ThemeProvider>
        </PersistQueryClientProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
});
