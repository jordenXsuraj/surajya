import { Alert, StyleSheet, View } from 'react-native';

import { ProfileButton } from '@/components/profile/ProfileButton';
import type { useFollowActions } from '@/hooks/useFollow';
import { FOLLOW_LABELS, followView, relationTo } from '@/lib/follow';
import { useAuthStore } from '@/stores/auth.store';

type FollowButtonProps = {
  id: string;
  name: string;
  /** From the screen's single useFollowActions() (lists don't need one per row). */
  actions: ReturnType<typeof useFollowActions>;
  compact?: boolean;
};

const firstName = (name: string) => name.split(' ')[0] || name;

/**
 * Follow state machine (src/lib/follow.ts) as a button: "+ Follow" / "Follow back" → "⏳ Requested"
 * (disabled: the API cannot withdraw a request) → "✓ Following" (tap → confirm → unfollow);
 * "✓ Accept" + "Reject" when they asked to follow me. Nothing for my own row.
 */
export function FollowButton({ id, name, actions, compact = false }: FollowButtonProps) {
  const view = useAuthStore((s) => followView(relationTo(s.user, id), s.user?._id === id));
  const person = { id, name };

  switch (view) {
    case 'self':
      return null;
    case 'incoming':
      return (
        <View style={styles.pair}>
          <ProfileButton
            label="✓ Accept"
            a11y={`Accept ${name}'s follow request`}
            kind="primary"
            compact={compact}
            onPress={() => actions.accept(person)}
          />
          <ProfileButton
            label="Reject"
            a11y={`Reject ${name}'s follow request`}
            kind="secondary"
            compact={compact}
            onPress={() => actions.reject(person)}
          />
        </View>
      );
    case 'following':
      return (
        <ProfileButton
          label={FOLLOW_LABELS.following}
          a11y={`Following ${name}. Tap to unfollow`}
          kind="secondary"
          compact={compact}
          onPress={() =>
            Alert.alert(
              `Unfollow ${firstName(name)}?`,
              'Their posts will leave your Following feed.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unfollow', style: 'destructive', onPress: () => actions.unfollow(person) },
              ],
            )
          }
        />
      );
    case 'requested':
      return (
        <ProfileButton
          label={FOLLOW_LABELS.requested}
          a11y={`Follow request sent to ${name}`}
          kind="muted"
          compact={compact}
        />
      );
    default:
      return (
        <ProfileButton
          label={FOLLOW_LABELS[view]}
          a11y={view === 'followBack' ? `Follow ${name} back` : `Follow ${name}`}
          kind="primary"
          compact={compact}
          onPress={() => actions.follow(person)}
        />
      );
  }
}

const styles = StyleSheet.create({
  pair: { flexDirection: 'row', gap: 7 },
});
