import { useLocalSearchParams } from 'expo-router';

import { BackButton } from '@/components/BackButton';
import { EmptyState, Screen } from '@/components/ui';

// Someone's profile (also the App Link target themeetnet.com/profile/:id) — arrives later.
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <BackButton />
      <EmptyState
        emoji="👤"
        title="Profile"
        message={`Profile ${id} opens here in a later update.`}
      />
    </Screen>
  );
}
