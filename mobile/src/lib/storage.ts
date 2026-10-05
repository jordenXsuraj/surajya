import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createMMKV, deleteMMKV, type MMKV } from 'react-native-mmkv';

// The app's only MMKV instance. It is AES-256 encrypted with a random per-install key kept in
// SecureStore (Keychain / Android Keystore), so cached API data is not readable from a backup
// or a rooted device's files. Never create another MMKV instance.

export const MMKV_ID = 'meetnet';
export const ENCRYPTION_KEY_NAME = 'mmkv.encryptionKey';

// 64 symbols: each random byte maps to one character (byte % 64 is unbiased for 256 / 64).
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
// MMKV takes the key as a string and uses at most 32 bytes for AES-256. 32 ASCII characters
// = exactly 32 bytes with 192 bits of randomness.
const KEY_LENGTH = 32;

function generateKey(): string {
  const bytes = Crypto.getRandomBytes(KEY_LENGTH);
  let key = '';
  for (const byte of bytes) key += ALPHABET[byte % ALPHABET.length];
  return key;
}

function readKey(): string | null {
  try {
    return SecureStore.getItem(ENCRYPTION_KEY_NAME);
  } catch {
    // Keystore entry unreadable (e.g. restored from another device): start over.
    return null;
  }
}

let instance: MMKV | null = null;

/** Opens the encrypted store on first use (synchronous: SecureStore and MMKV are both sync). */
export function getStorage(): MMKV {
  if (instance) return instance;

  let key = readKey();
  if (!key || key.length !== KEY_LENGTH) {
    key = generateKey();
    SecureStore.setItem(ENCRYPTION_KEY_NAME, key);
    // Data written under a previous key (an OS backup restored without its Keystore key)
    // cannot be decrypted any more.
    deleteMMKV(MMKV_ID);
  }

  instance = createMMKV({ id: MMKV_ID, encryptionKey: key, encryptionType: 'AES-256' });
  return instance;
}

/** Wipes all cached data. The encryption key stays so the next session reuses it. */
export function clearCache(): void {
  getStorage().clearAll();
}

export function readJson<T>(key: string): T | null {
  const raw = getStorage().getString(key);
  if (raw === undefined) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    getStorage().remove(key);
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  getStorage().set(key, JSON.stringify(value));
}

/** Adapter for @tanstack/query-async-storage-persister (it accepts sync return values). */
export const mmkvPersisterStorage = {
  getItem: (key: string): string | null => getStorage().getString(key) ?? null,
  setItem: (key: string, value: string): void => getStorage().set(key, value),
  removeItem: (key: string): void => {
    getStorage().remove(key);
  },
};

/** Test helper: forget the opened instance so the next getStorage() runs the start-up path again. */
export function resetStorageForTests(): void {
  instance = null;
}
