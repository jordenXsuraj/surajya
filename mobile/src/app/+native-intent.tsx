import { resolveIncomingLink } from '@/lib/deepLinks';
import { bootstrapAuth, useAuthStore } from '@/stores/auth.store';

// Every link the system hands the app (App Links, meetnet:// / meetnet-dev://) passes through here
// before expo-router matches it. Signed out, the target is kept and opened after sign-in, since
// the signed-in screens sit behind Stack.Protected and would otherwise drop it.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (useAuthStore.getState().status === 'loading') bootstrapAuth();
    const signedIn = useAuthStore.getState().status === 'signedIn';
    const link = resolveIncomingLink(path, signedIn);
    if (link.kind === 'passthrough') return path;
    if (link.kind === 'afterSignIn') {
      useAuthStore.getState().setPendingPath(link.path);
      return '/';
    }
    return link.path;
  } catch {
    return '/';
  }
}
