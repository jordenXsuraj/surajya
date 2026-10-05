import { getMe } from '@/api/endpoints/users';
import { toSessionUser } from '@/lib/sessionUser';
import { useAuthStore } from '@/stores/auth.store';
import type { Me } from '@/types/user';

/**
 * Refreshes the cached user from GET /users/me. A 401 signs out (client interceptor); a network
 * error keeps the cached user so the app works offline. Returns the fresh user or null.
 */
export async function refreshSession(): Promise<Me | null> {
  const token = useAuthStore.getState().token;
  if (!token) return null;
  try {
    const me = await getMe();
    // Ignore the answer if the user signed out or switched sessions meanwhile.
    if (useAuthStore.getState().token === token) useAuthStore.getState().setUser(toSessionUser(me));
    return me;
  } catch {
    return null;
  }
}
