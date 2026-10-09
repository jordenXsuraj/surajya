import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { FullWindowOverlay } from 'react-native-screens';

import { refreshSession } from '@/api/session';
import { EmailNotVerifiedSheet } from '@/components/EmailNotVerifiedSheet';
import { ImageViewer } from '@/components/post/ImageViewer';
import { PostMenuSheet } from '@/components/post/PostMenuSheet';
import { ProfileMenuSheet } from '@/components/profile/ProfileMenuSheet';
import { RepliesSheet } from '@/components/post/RepliesSheet';
import { ReportSheet } from '@/components/post/ReportSheet';
import { YouTubeModal } from '@/components/post/YouTubeModal';
import { ToastHost } from '@/components/ui';
import { persistOptions, queryClient } from '@/lib/queryClient';
import { setupReactQueryNative } from '@/lib/reactQueryNative';
import { loadAppConfig } from '@/stores/appConfig.store';
import { bootstrapAuth, useAuthStore } from '@/stores/auth.store';
import { fontAssets } from '@/theme/fonts';
import { colors } from '@/theme/tokens';

void SplashScreen.preventAutoHideAsync();

// Synchronous: token from SecureStore + cached user from MMKV, so the first render already
// knows which stack to show (no loading screen, cold-start deep links keep working).
bootstrapAuth();
setupReactQueryNative();
loadAppConfig();

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

// Toasts are mounted once, after the navigator. iOS native modals (compose) cover that root view,
// so there the toast goes into a FullWindowOverlay (sheets use the same via containerComponent).
function Toasts() {
  if (Platform.OS !== 'ios') return <ToastHost />;
  return (
    <FullWindowOverlay>
      <ToastHost />
    </FullWindowOverlay>
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
                </Stack.Protected>
                <Stack.Protected guard={!signedIn}>
                  <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                </Stack.Protected>
              </Stack>
              {signedIn ? (
                <>
                  <RepliesSheet />
                  <PostMenuSheet />
                  <ProfileMenuSheet />
                  <ReportSheet />
                  <ImageViewer />
                  <YouTubeModal />
                </>
              ) : null}
              <EmailNotVerifiedSheet />
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
