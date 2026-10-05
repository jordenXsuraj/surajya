import { createMMKV, deleteMMKV } from 'react-native-mmkv';

import {
  ENCRYPTION_KEY_NAME,
  MMKV_ID,
  clearCache,
  getStorage,
  resetStorageForTests,
} from '@/lib/storage';
import { secureStoreMap } from '@/test/helpers';

// Wrap MMKV's own Jest mock so the calls can be inspected.
jest.mock('react-native-mmkv', () => {
  const actual = jest.requireActual('react-native-mmkv');
  return {
    ...actual,
    createMMKV: jest.fn(actual.createMMKV),
    deleteMMKV: jest.fn(actual.deleteMMKV),
  };
});

const createSpy = jest.mocked(createMMKV);
const deleteSpy = jest.mocked(deleteMMKV);

beforeEach(() => {
  secureStoreMap().clear();
  resetStorageForTests();
  createSpy.mockClear();
  deleteSpy.mockClear();
});

describe('encrypted MMKV', () => {
  it('first launch: generates a 32-byte key, saves it in SecureStore and opens MMKV with AES-256', () => {
    getStorage();

    const key = secureStoreMap().get(ENCRYPTION_KEY_NAME);
    expect(key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(new TextEncoder().encode(key).length).toBe(32);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith({
      id: MMKV_ID,
      encryptionKey: key,
      encryptionType: 'AES-256',
    });
    // Old data written under an unknown key is discarded before first use.
    expect(deleteSpy).toHaveBeenCalledWith(MMKV_ID);
  });

  it('second launch: reuses the saved key', () => {
    getStorage();
    const key = secureStoreMap().get(ENCRYPTION_KEY_NAME);
    resetStorageForTests(); // simulate an app restart
    createSpy.mockClear();
    deleteSpy.mockClear();

    getStorage();

    expect(secureStoreMap().get(ENCRYPTION_KEY_NAME)).toBe(key);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ encryptionKey: key }));
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('keys differ between installs', () => {
    getStorage();
    const first = secureStoreMap().get(ENCRYPTION_KEY_NAME);
    secureStoreMap().clear();
    resetStorageForTests();
    getStorage();
    expect(secureStoreMap().get(ENCRYPTION_KEY_NAME)).not.toBe(first);
  });

  it('opens once per process', () => {
    expect(getStorage()).toBe(getStorage());
    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('clearCache wipes the data but keeps the key', () => {
    getStorage().set('a', '1');
    const key = secureStoreMap().get(ENCRYPTION_KEY_NAME);

    clearCache();

    expect(getStorage().getAllKeys()).toEqual([]);
    expect(secureStoreMap().get(ENCRYPTION_KEY_NAME)).toBe(key);
  });
});
