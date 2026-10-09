import { useLocalSearchParams } from 'expo-router';

import { PeopleList } from '@/components/profile/PeopleList';
import { usePeople } from '@/hooks/useProfile';

// People someone follows (web StudentProfile.jsx "Following ›" sheet).
export default function FollowingScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  return (
    <PeopleList
      title="Following"
      query={usePeople('following', id)}
      empty={{ emoji: '👥', title: 'Not following anyone' }}
    />
  );
}
