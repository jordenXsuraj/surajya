import { BackButton } from '@/components/BackButton';
import { EmptyState, Screen } from '@/components/ui';

// Opened from the bell on Home. The list arrives with the Connect / Activity work.
export default function NotificationsScreen() {
  return (
    <Screen>
      <BackButton />
      <EmptyState
        emoji="🔔"
        title="Notifications"
        message="Your likes, replies and follow requests will show up here in a later update."
      />
    </Screen>
  );
}
