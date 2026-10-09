import { PeopleList } from '@/components/profile/PeopleList';
import { usePeople } from '@/hooks/useProfile';

// People I follow (web Profile.jsx "Following ›" sheet).
export default function MyFollowingScreen() {
  return (
    <PeopleList
      title="Following"
      query={usePeople('following')}
      empty={{ emoji: '👥', title: 'Not following anyone yet' }}
    />
  );
}
