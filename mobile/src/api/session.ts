import { getMe } from '@/api/endpoints/users';
import { queryKeys } from '@/api/queryKeys';
import { queryClient } from '@/lib/queryClient';
import { toSessionUser } from '@/lib/sessionUser';
import { useAuthStore } from '@/stores/auth.store';
import type { Me } from '@/types/user';

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/**
 * Stores a fresh GET /users/me as the session user, unless the user signed out or switched
 * sessions while it was loading (`token` is the one the request was sent with). When the people
 * I follow changed elsewhere (someone accepted my request on their phone, I unfollowed on the
 * web), the Following feed is refetched so it shows that without a pull-to-refresh.
 */
export function applyMe(me: Me, token: string | null): void {
  const store = useAuthStore.getState();
  if (store.token !== token) return;
  const previous = store.user;
  const next = toSessionUser(me);
  store.setUser(next);
  if (previous && !sameIds(previous.followingIds, next.followingIds)) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.followingFeed });
  }
}

/**
 * Refreshes the cached user from GET /users/me. A 401 signs out (client interceptor); a network
 * error keeps the cached user so the app works offline. Returns the fresh user or null.
 */
export async function refreshSession(): Promise<Me | null> {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  try {
    const me = await getMe();
    applyMe(me, token);
    return me;
  } catch {
    return null;
  }
}
