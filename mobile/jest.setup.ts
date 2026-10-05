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
}));
