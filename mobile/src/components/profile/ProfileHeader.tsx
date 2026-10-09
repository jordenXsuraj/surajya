import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ProgressBar } from '@/components/compose/ProgressBar';
import { ContributorBadge } from '@/components/ContributorBadge';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { cloudinaryUrl } from '@/lib/cloudinary';
import type { ProfileData } from '@/lib/profile';
import { decodeEntities } from '@/lib/text';
import type { PhotoUpload } from '@/stores/profilePhoto.store';
import { colors, fonts, touch } from '@/theme/tokens';

const AVATAR = 76;

type ProfileHeaderProps = {
  profile: ProfileData;
  isMe: boolean;
  /** Posts count as shown ("12", "20+"). */
  postsLabel: string;
  onPressPosts: () => void;
  onPressFollowing: () => void;
  onPressFollowers: () => void;
  /** Edit profile / Share, or the follow button. */
  actions: ReactNode;
  /** Me only: photo and cover editing, and uploads in progress. */
  avatarUpload?: PhotoUpload;
  coverUpload?: PhotoUpload;
  onEditAvatar?: () => void;
  onEditCover?: () => void;
  onViewAvatar?: () => void;
};

// Web Profile.jsx / StudentProfile.jsx header: cover (gradient when empty), avatar over its
// lower edge, buttons on the right, name (+ ★), @username, bio, year / branch / college tags
// (+ 🎓 Senior), then Posts · Following › · Followers ›.
export function ProfileHeader({
  profile,
  isMe,
  postsLabel,
  onPressPosts,
  onPressFollowing,
  onPressFollowers,
  actions,
  avatarUpload,
  coverUpload,
  onEditAvatar,
  onEditCover,
  onViewAvatar,
}: ProfileHeaderProps) {
  const name = decodeEntities(profile.name);
  const bio = decodeEntities(profile.bio ?? '');
  const coverUri = coverUpload?.localUri ?? profile.coverImage ?? '';
  const avatarUri = avatarUpload?.localUri ?? profile.avatar ?? '';

  return (
    <View>
      <View style={styles.cover}>
        {coverUri ? (
          <Image
            source={{ uri: cloudinaryUrl(coverUri, { width: 1500 }) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            accessibilityLabel="Cover photo"
          />
        ) : null}
        {coverUpload?.status === 'uploading' ? (
          <View style={styles.coverProgress}>
            <Text style={styles.coverProgressText}>
              Uploading cover… {Math.round(coverUpload.progress * 100)}%
            </Text>
            <ProgressBar progress={coverUpload.progress} />
          </View>
        ) : isMe && onEditCover ? (
          <Pressable
            onPress={onEditCover}
            accessibilityRole="button"
            hitSlop={touch.hitSlop}
            style={({ pressed }) => [styles.coverEdit, pressed && styles.pressed]}
          >
            <Text style={styles.coverEditText}>📷 Edit cover</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.topRow}>
        <View>
          <Pressable
            onPress={onViewAvatar}
            disabled={!onViewAvatar || !avatarUri}
            accessibilityRole="imagebutton"
            accessibilityLabel={isMe ? 'Your profile photo' : `${name}'s profile photo`}
            style={styles.avatarRing}
          >
            <Avatar name={name} uri={avatarUri || null} size={AVATAR} />
            {avatarUpload?.status === 'uploading' ? (
              <UploadRing progress={avatarUpload.progress} />
            ) : null}
          </Pressable>
          {isMe && onEditAvatar ? (
            <Pressable
              onPress={onEditAvatar}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              hitSlop={touch.hitSlop}
              style={styles.avatarEdit}
            >
              <Text style={styles.avatarEditText}>📷</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.actions}>{actions}</View>
      </View>

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {profile.isContributor ? <ContributorBadge /> : null}
        </View>
        {profile.username ? <Text style={styles.handle}>@{profile.username}</Text> : null}
        {bio ? (
          <Text style={styles.bio}>{bio}</Text>
        ) : isMe ? (
          <Text style={[styles.bio, styles.bioEmpty]}>
            No bio yet. Tap Edit Profile to add one.
          </Text>
        ) : null}
        <View style={styles.tags}>
          <Badge label={`${profile.year} year`} color="blue" tint="bl" />
          {profile.branch ? <Badge label={profile.branch} /> : null}
          <Badge label={`🏫 ${decodeEntities(profile.college)}`} color="green" tint="gl" />
          {profile.year === '4th' ? <Badge label="🎓 Senior" color="yellow" tint="yl" /> : null}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat
          value={postsLabel}
          label="Posts"
          onPress={onPressPosts}
          a11y={`${postsLabel} posts`}
        />
        <Stat
          value={String(profile.followingCount)}
          label="Following ›"
          onPress={onPressFollowing}
          a11y={`Following ${profile.followingCount}`}
        />
        <Stat
          value={String(profile.followerCount)}
          label="Followers ›"
          onPress={onPressFollowers}
          a11y={`Followers ${profile.followerCount}`}
          last
        />
      </View>
    </View>
  );
}

function Stat({
  value,
  label,
  onPress,
  a11y,
  last = false,
}: {
  value: string;
  label: string;
  onPress: () => void;
  a11y: string;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.stat, !last && styles.statDivider, pressed && styles.pressed]}
    >
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

/** Upload progress drawn around the avatar. */
function UploadRing({ progress }: { progress: number }) {
  const size = AVATAR + 6;
  const r = size / 2 - 2;
  const length = 2 * Math.PI * r;
  return (
    <View style={styles.ring} accessibilityLabel={`Uploading photo ${Math.round(progress * 100)}%`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.br2} strokeWidth={3} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.accent}
          strokeWidth={3}
          fill="none"
          strokeDasharray={`${length} ${length}`}
          strokeDashoffset={length * (1 - Math.min(1, Math.max(0, progress)))}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // .prof-cover-wrap: 3:1, the same shape as the uploaded cover
  cover: {
    width: '100%',
    aspectRatio: 3,
    overflow: 'hidden',
    backgroundColor: colors.coverMid,
    experimental_backgroundImage: `radial-gradient(circle at 65% 50%, ${colors.ag}, transparent 55%), linear-gradient(135deg, ${colors.coverFrom}, ${colors.coverMid}, ${colors.coverTo})`,
    borderBottomWidth: 1,
    borderBottomColor: colors.br,
  },
  coverEdit: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.shadeStrong,
  },
  coverEditText: { fontFamily: fonts.bold, fontSize: 11.2, color: colors.white },
  coverProgress: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    gap: 6,
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.shadeStrong,
  },
  coverProgressText: { fontFamily: fonts.bold, fontSize: 11.2, color: colors.white },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: -30,
    marginBottom: 12,
    gap: 12,
  },
  avatarRing: {
    width: AVATAR + 6,
    height: AVATAR + 6,
    borderRadius: (AVATAR + 6) / 2,
    borderWidth: 3,
    borderColor: colors.bg,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: { position: 'absolute', top: -3, left: -3 },
  avatarEdit: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.bg,
    backgroundColor: colors.bg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditText: { fontSize: 12 },
  actions: { flexShrink: 1, flexDirection: 'row', gap: 7, marginBottom: 4 },
  info: { paddingHorizontal: 16, paddingBottom: 13 },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  name: {
    flexShrink: 1,
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.text,
    letterSpacing: -0.5,
  },
  handle: { fontFamily: fonts.regular, fontSize: 11.4, color: colors.dim, marginBottom: 6 },
  bio: {
    fontFamily: fonts.regular,
    fontSize: 13.1,
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 10,
  },
  bioEmpty: { fontStyle: 'italic', color: colors.dim },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  stats: {
    flexDirection: 'row',
    marginHorizontal: 15,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.br,
    overflow: 'hidden',
  },
  stat: { flex: 1, minHeight: touch.min, paddingVertical: 12, alignItems: 'center' },
  statDivider: { borderRightWidth: 1, borderRightColor: colors.br },
  statValue: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  statLabel: { fontFamily: fonts.semibold, fontSize: 10, color: colors.dim, marginTop: 1 },
  pressed: { opacity: 0.7 },
});
