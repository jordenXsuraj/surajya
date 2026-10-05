import { EmptyState } from '@/components/ui/EmptyState';
import { errorMessage } from '@/api/errors';

type ErrorStateProps = {
  error: unknown;
  onRetry?: () => void;
};

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <EmptyState
      emoji="⚠️"
      title="Couldn't load this"
      message={errorMessage(error)}
      actionTitle={onRetry ? 'Try again' : undefined}
      onAction={onRetry}
    />
  );
}
