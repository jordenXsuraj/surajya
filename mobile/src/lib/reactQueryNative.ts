import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

let wired = false;

/**
 * React Query's browser defaults don't apply in React Native: tell it when the device is online
 * (NetInfo) and when the app is in the foreground (AppState). Offline, queries pause and the cached
 * feed stays on screen; they refetch when the connection comes back.
 */
export function setupReactQueryNative(): void {
  if (wired) return;
  wired = true;
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  AppState.addEventListener('change', (status: AppStateStatus) =>
    focusManager.setFocused(status === 'active'),
  );
}

/** false only when NetInfo is sure there is no connection (unknown counts as online). */
export function useIsOnline(): boolean {
  return useNetInfo().isConnected !== false;
}
