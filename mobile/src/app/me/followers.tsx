import { PeopleList } from '@/components/profile/PeopleList';
import { usePeople } from '@/hooks/useProfile';

// My followers (web Profile.jsx "Followers ›" sheet).
export default function MyFollowersScreen() {
  return (
    <PeopleList
      title="Followers"
      query={usePeople('followers')}
      empty={{ emoji: '👥', title: 'No followers yet' }}
    />
  );
}
