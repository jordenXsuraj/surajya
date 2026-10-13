// Global mocks for native modules that do not exist under Jest.

process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api';

// MMKV ships its own in-memory mock for Jest, but still imports Nitro.
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: { createHybridObject: jest.fn(() => ({})) },
}));

// SecureStore backed by a Map; tests reach it through `require('expo-secure-store').__store`.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

jest.mock('expo-crypto', () => ({
  getRandomBytes: jest.fn(
    (count: number) => new Uint8Array(jest.requireActual('crypto').randomBytes(count)),
  ),
  randomUUID: jest.fn(() => jest.requireActual('crypto').randomUUID()),
}));

// Push (src/lib/push.ts): permission granted, a fixed Expo push token, no-op listeners.
jest.mock('expo-notifications', () => {
  const subscription = () => ({ remove: jest.fn() });
  return {
    AndroidImportance: { DEFAULT: 5, HIGH: 6, MAX: 7 },
    DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(async () => null),
    getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
    requestPermissionsAsync: jest.fn(async () => ({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    })),
    getDevicePushTokenAsync: jest.fn(async () => ({ type: 'android', data: 'fcm-device-token' })),
    getExpoPushTokenAsync: jest.fn(async () => ({
      type: 'expo',
      data: 'ExponentPushToken[test-token]',
    })),
    setBadgeCountAsync: jest.fn(async () => true),
    dismissAllNotificationsAsync: jest.fn(async () => undefined),
    addPushTokenListener: jest.fn(subscription),
    addNotificationReceivedListener: jest.fn(subscription),
    addNotificationResponseReceivedListener: jest.fn(subscription),
    useLastNotificationResponse: jest.fn(() => undefined),
    clearLastNotificationResponse: jest.fn(),
  };
});

// Native modules added for the feeds
jest.mock('@react-native-community/netinfo', () =>
  jest.requireActual('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
