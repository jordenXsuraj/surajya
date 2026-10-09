import { useLocalSearchParams } from 'expo-router';

import { PeopleList } from '@/components/profile/PeopleList';
import { usePeople } from '@/hooks/useProfile';

// Someone's followers (web StudentProfile.jsx "Followers ›" sheet).
export default function FollowersScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return (
    <PeopleList
      title="Followers"
      query={usePeople('followers', id)}
      empty={{ emoji: '👥', title: 'No followers yet' }}
    />
  );
}
