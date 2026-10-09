import { useQuery } from '@tanstack/react-query';

import { getMe } from '@/api/endpoints/users';
import { queryKeys } from '@/api/queryKeys';
import { applyMe } from '@/api/session';
import { useAuthStore } from '@/stores/auth.store';
import type { Me } from '@/types/user';

async function fetchMe(): Promise<Me> {
  const token = useAuthStore.getState().token;
  const me = await getMe();
  applyMe(me, token);
  return me;
}

/** GET /users/me through React Query; keeps the auth store's cached user in sync. */
export function useMe() {
  const token = useAuthStore((s) => s.token);
  return useQuery({ queryKey: queryKeys.me, enabled: Boolean(token), queryFn: fetchMe });
}

const EMPTY: ReadonlySet<string> = new Set();
const selectSaved = (me: Me): ReadonlySet<string> => new Set((me.savedPosts ?? []).map(String));

/** Ids of the posts this user saved (from GET /users/me `savedPosts`). */
export function useSavedIds(): ReadonlySet<string> {
  const token = useAuthStore((s) => s.token);
  const query = useQuery({
    queryKey: queryKeys.me,
    enabled: Boolean(token),
    queryFn: fetchMe,
    select: selectSaved,
  });
  return query.data ?? EMPTY;
}

export function useSessionUser() {
  return useAuthStore((s) => s.user);
}
