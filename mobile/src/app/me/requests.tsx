import { PeopleList } from '@/components/profile/PeopleList';
import { useRequests } from '@/hooks/useProfile';

// Follow requests waiting for my answer (web Connect.jsx Activity → Requests): ✓ Accept / Reject.
export default function RequestsScreen() {
  return (
    <PeopleList
      title="Follow requests"
      query={useRequests()}
      empty={{
        emoji: '📭',
        title: 'No pending requests',
        message: 'When someone wants to Connect with you, it appears here',
      }}
    />
  );
}
