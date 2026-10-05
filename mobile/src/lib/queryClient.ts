import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/errors';
import { mmkvPersisterStorage } from '@/lib/storage';

const DAY = 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      gcTime: DAY, // must be >= the persister's maxAge
      // Retry only what can succeed on a second try: no connection, timeouts, server errors.
      retry: (failureCount, error) =>
        failureCount < 2 &&
        (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
    mutations: { retry: false },
  },
});

export const persister = createAsyncStoragePersister({
  storage: mmkvPersisterStorage,
  key: 'rq.cache',
  throttleTime: 1000,
});

export const persistOptions = {
  persister,
  maxAge: DAY,
  buster: '1', // bump when cached shapes change incompatibly
};
