import type { ObjectId } from '@/types/api';
import type { AuthUser, Me, SessionUser, UserRef } from '@/types/user';

const idOf = (entry: UserRef | ObjectId): ObjectId =>
  typeof entry === 'string' ? entry : entry._id;

/** Normalises the different user shapes the API returns (signup/login vs /users/me). */
export function toSessionUser(user: AuthUser | Me): SessionUser {
  const following = (user.following ?? []).map(idOf);
  const followers = user.followers ?? [];
  const counts = user as Partial<Pick<Me, 'followingCount' | 'followerCount'>>;

  return {
    _id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar ?? '',
    username: user.username ?? null,
    college: user.college,
    year: user.year,
    branch: user.branch,
    bio: user.bio ?? '',
    skills: user.skills ?? [],
    projects: user.projects ?? [],
    roadmap: user.roadmap ?? '',
    isSenior: user.isSenior ?? user.year === '4th',
    emailVerified: Boolean(user.emailVerified),
    emailBounced: Boolean(user.emailBounced),
    verificationRequired: Boolean(user.verificationRequired),
    followingIds: following,
    followerIds: followers,
    followingCount: counts.followingCount ?? following.length,
    followerCount: counts.followerCount ?? followers.length,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    createdAt: user.createdAt,
  };
}

/** True when the Home banner / Me tab should ask the user to verify or fix their email. */
export function needsEmailAttention(user: SessionUser | null): boolean {
  return Boolean(user && (!user.emailVerified || user.emailBounced));
}
