import { router } from 'expo-router';
import { memo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ContributorBadge } from '@/components/ContributorBadge';
import { FollowButton } from '@/components/profile/FollowButton';
import { ProfileButton } from '@/components/profile/ProfileButton';
import { Avatar, Text } from '@/components/ui';
import type { useFollowActions } from '@/hooks/useFollow';
import { decodeEntities } from '@/lib/text';
import { colors, fonts, layout, touch } from '@/theme/tokens';
import type { PersonRow } from '@/types/user';

export type PersonRowData = PersonRow & { isContributor?: boolean; isSenior?: boolean };

type PersonRowItemProps = {
  person: PersonRowData;
  index: number;
  myId: string;
  /** follow: the follow button; blocked: Unblock, and the row doesn't open the profile. */
  mode?: 'follow' | 'blocked';
  actions: ReturnType<typeof useFollowActions>;
  onUnblock?: (person: { id: string; name: string }) => void;
};

/** "3rd yr CS · College" (web .person-role). */
export function personRole(person: Pick<PersonRow, 'year' | 'branch' | 'college'>): string {
  return [
    [person.year && `${person.year} yr`, person.branch].filter(Boolean).join(' '),
    person.college && decodeEntities(person.college),
  ]
    .filter(Boolean)
    .join(' · ');
}

export const isSeniorPerson = (person: Pick<PersonRowData, 'year' | 'isSenior'>) =>
  person.isSenior ?? person.year === '4th';

// Web PeopleSheet / Connect PersonCard row: avatar, name (+ ★ contributor, 🎓 Senior), "3rd yr CS ·
// College", up to 3 skills, and the follow button (or Unblock).
export const PersonRowItem = memo(function PersonRowItem({
  person,
  index,
  myId,
  mode = 'follow',
  actions,
  onUnblock,
}: PersonRowItemProps) {
  const id = String(person._id);
  const name = decodeEntities(person.name);
  const role = personRole(person);
  const open =
    mode === 'blocked'
      ? undefined
      : () => (id === myId ? router.navigate('/me') : router.push(`/profile/${id}`));

  return (
    <View style={styles.row}>
      <Pressable
        onPress={open}
        disabled={!open}
        accessibilityRole={open ? 'button' : undefined}
        accessibilityLabel={open ? `Open ${name}'s profile` : name}
        style={styles.person}
      >
        <Avatar name={name} uri={person.avatar || null} size={44} colorIndex={index} />
        <View style={styles.info}>
          <View style={styles.nameLine}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            {person.isContributor ? <ContributorBadge size={16} /> : null}
            {isSeniorPerson(person) ? <Text style={styles.senior}>🎓 Senior</Text> : null}
          </View>
          {role ? (
            <Text style={styles.role} numberOfLines={1}>
              {role}
            </Text>
          ) : person.username ? (
            <Text style={styles.role}>@{person.username}</Text>
          ) : null}
          {person.skills?.length ? (
            <View style={styles.skills}>
              {person.skills.slice(0, 3).map((s) => (
                <View key={s} style={styles.skill}>
                  <Text style={styles.skillText}>{decodeEntities(s)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
      {mode === 'blocked' ? (
        <ProfileButton
          label="Unblock"
          a11y={`Unblock ${name}`}
          kind="secondary"
          compact
          onPress={() =>
            Alert.alert(
              `Unblock ${name.split(' ')[0]}?`,
              "You'll see each other's posts and profiles again. Follows that were removed don't come back.",
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Unblock', onPress: () => onUnblock?.({ id, name }) },
              ],
            )
          }
        />
      ) : (
        <FollowButton id={id} name={name} actions={actions} compact />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: layout.gutter,
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.br,
    backgroundColor: colors.card,
  },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: touch.min },
  info: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  name: { flexShrink: 1, fontFamily: fonts.extrabold, fontSize: 14, color: colors.text },
  senior: { marginLeft: 6, fontFamily: fonts.semibold, fontSize: 10.2, color: colors.yellow },
  role: { fontFamily: fonts.regular, fontSize: 11.4, color: colors.dim, marginTop: 2 },
  skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  skill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.br2,
    backgroundColor: colors.br,
  },
  skillText: { fontFamily: fonts.semibold, fontSize: 10.2, color: colors.muted },
});
