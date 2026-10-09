import { PeopleList } from '@/components/profile/PeopleList';
import { useBlocked } from '@/hooks/useProfile';

// Settings → Blocked users: unblock (their profile and posts come back; removed follows don't).
export default function BlockedScreen() {
  return (
    <PeopleList
      title="Blocked users"
      query={useBlocked()}
      mode="blocked"
      empty={{ emoji: '🚫', title: 'No blocked users', message: 'People you block show up here.' }}
    />
  );
}
