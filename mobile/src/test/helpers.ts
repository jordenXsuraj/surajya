import {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

import { api } from '@/api/client';
import { resetStorageForTests } from '@/lib/storage';
import { useAuthStore } from '@/stores/auth.store';
import { useUiStore } from '@/stores/ui.store';
import type { AuthUser, Me, SessionUser } from '@/types/user';

type Reply = { status: number; data?: unknown } | 'network' | 'timeout';

/** Replaces the HTTP layer of the real API client; every request goes to `handler`. */
export function mockApi(handler: (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>) {
  const calls: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config);
    const reply = await handler(config);
    if (reply === 'network') throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
    if (reply === 'timeout')
      throw new AxiosError('timeout of 20000ms exceeded', AxiosError.ECONNABORTED, config);
    const response: AxiosResponse = {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: {},
      config,
    };
    if (reply.status >= 200 && reply.status < 300) return response;
    throw new AxiosError(
      'Request failed',
      AxiosError.ERR_BAD_RESPONSE,
      config,
      undefined,
      response,
    );
  };
  api.defaults.adapter = adapter;
  return calls;
}

export function secureStoreMap(): Map<string, string> {
  return (jest.requireMock('expo-secure-store') as { __store: Map<string, string> }).__store;
}

/** Fresh SecureStore, MMKV and stores for each test. */
export function resetAll() {
  secureStoreMap().clear();
  resetStorageForTests();
  useAuthStore.setState({
    status: 'loading',
    token: null,
    user: null,
    pendingVerify: false,
    resendAvailableAt: 0,
  });
  useUiStore.getState().reset();
}

export const authUser: AuthUser = {
  _id: 'u1',
  name: 'Asha Patil',
  avatar: '',
  username: 'asha',
  email: 'asha@example.com',
  college: 'Pune Institute of Computer Technology (PICT)',
  year: '2nd',
  branch: 'CS',
  bio: '',
  skills: ['React'],
  projects: [],
  roadmap: '',
  isSenior: false,
  mediaItems: [],
  following: ['u2', 'u3'],
  followers: ['u4'],
  sentRequests: [],
  pendingRequests: [],
  termsAcceptedAt: '2026-10-01T10:00:00.000Z',
  emailVerified: false,
  emailBounced: false,
  verificationRequired: true,
  createdAt: '2026-10-01T10:00:00.000Z',
};

export const me: Me = {
  ...authUser,
  id: 'u1',
  name: 'Asha P.',
  following: [
    { _id: 'u2', name: 'B' },
    { _id: 'u3', name: 'C' },
  ],
  pendingRequests: [],
  followingCount: 2,
  followerCount: 1,
  emailVerified: true,
  verificationRequired: false,
};

export function sessionUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    _id: 'u1',
    name: 'Asha Patil',
    email: 'asha@example.com',
    avatar: '',
    username: 'asha',
    college: 'PICT',
    year: '2nd',
    branch: 'CS',
    bio: '',
    skills: [],
    projects: [],
    roadmap: '',
    isSenior: false,
    emailVerified: false,
    emailBounced: false,
    verificationRequired: true,
    coverImage: '',
    isContributor: false,
    mediaItems: [],
    followingIds: [],
    followerIds: [],
    sentRequestIds: [],
    incomingRequestIds: [],
    blockedIds: [],
    followingCount: 0,
    followerCount: 0,
    termsAcceptedAt: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}
