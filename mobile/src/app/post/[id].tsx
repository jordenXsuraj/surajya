import { useLocalSearchParams } from 'expo-router';

import { BackButton } from '@/components/BackButton';
import { EmptyState, Screen } from '@/components/ui';

// Single post (also the App Link target themeetnet.com/post/:id) — arrives in Prompt 3.
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <BackButton />
      <EmptyState emoji="📝" title="Post" message={`Post ${id} opens here in the next update.`} />
    </Screen>
  );
}
