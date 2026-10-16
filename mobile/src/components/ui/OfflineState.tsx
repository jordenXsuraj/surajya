import type { FetchStatus } from '@tanstack/react-query';

import { EmptyState } from '@/components/ui/EmptyState';

/**
 * A query with nothing cached that waits for a connection: React Query pauses it while NetInfo
 * says offline (it stays "pending"), so a skeleton would spin forever. It loads by itself when
 * the connection is back.
 */
export const waitingForNetwork = (query: { fetchStatus: FetchStatus; data: unknown }): boolean =>
  query.fetchStatus === 'paused' && query.data === undefined;

/** Shown instead of the loading skeleton while `waitingForNetwork` is true. */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      emoji="📡"
      title="You're offline"
      message="This loads as soon as you're back online."
      actionTitle={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
