import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints/users';
import { queryKeys } from '@/api/queryKeys';
import { toSessionUser } from '@/lib/sessionUser';
import { useAuthStore } from '@/stores/auth.store';

/** GET /users/me through React Query; keeps the auth store's cached user in sync. */
export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({
    queryKey: queryKeys.me,
    enabled: Boolean(token),
    queryFn: async () => {
      const me = await getMe();
      if (useAuthStore.getState().token === token)
        useAuthStore.getState().setUser(toSessionUser(me));
      return me;
    },
  });
}

export function useSessionUser() {
  return useAuthStore((s) => s.user);
}
