import type { IsoDate, ObjectId } from './api';

// Shapes from server/routes/auth.js (cleanUser) and server/routes/users.js (safeUser, lists).
// Fields added to the User model later (username, coverImage, isContributor, mediaItems…)
// are missing on some older documents and lean responses, so they are optional.

export type Year = '1st' | '2nd' | '3rd' | '4th';

export type Project = { name: string; link?: string };

export type MediaItem = {
  type: 'youtube' | 'yt-video' | 'yt-short' | 'yt-channel' | 'yt-playlist' | 'instagram';
  url: string;
  addedAt?: IsoDate;
};

/** Small populated user inside GET /users/me `following` / `pendingRequests`. */
export type UserRef = {
  _id: ObjectId;
  name: string;
  year?: Year;
  branch?: string;
  skills?: string[];
  college?: string;
  avatar?: string;
};

/** POST /auth/signup, /auth/login, /auth/verify-email → `user` (ids only in the lists). */
export type AuthUser = {
  _id: ObjectId;
  name: string;
  avatar?: string;
  username?: string;
  email: string;
  college: string;
  year: Year;
  branch: string;
  bio?: string;
  skills: string[];
  projects: Project[];
  roadmap?: string;
  isSenior: boolean;
  mediaItems?: MediaItem[];
  following: ObjectId[];
  followers: ObjectId[];
  sentRequests: ObjectId[];
  pendingRequests: ObjectId[];
  termsAcceptedAt: IsoDate | null;
  emailVerified: boolean;
  emailBounced: boolean;
  verificationRequired: boolean;
  createdAt: IsoDate;
};

/**
 * GET /users/me: populated `following` / `pendingRequests`. PUT /users/me, PUT /users/me/email
 * and the avatar/cover uploads return the same object with those lists as plain ids.
 */
export type Me = Omit<AuthUser, 'following' | 'pendingRequests' | 'isSenior'> & {
  id?: string;
  isSenior?: boolean;
  isContributor?: boolean;
  coverImage?: string;
  following: (UserRef | ObjectId)[];
  pendingRequests: (UserRef | ObjectId)[];
  blockedUsers?: ObjectId[];
  followingCount: number;
  followerCount: number;
  updatedAt?: IsoDate;
};

/** GET /users/:id */
export type PublicUser = {
  _id: ObjectId;
  name: string;
  username?: string;
  avatar?: string;
  coverImage?: string;
  college: string;
  year: Year;
  branch: string;
  bio?: string;
  skills: string[];
  projects: Project[];
  roadmap?: string;
  mediaItems?: MediaItem[];
  isContributor?: boolean;
  followingCount: number;
  followerCount: number;
  createdAt?: IsoDate;
};

/** Connect / followers / following lists. */
export type UserCard = {
  _id: ObjectId;
  name: string;
  username?: string;
  year: Year;
  branch: string;
  bio?: string;
  skills: string[];
  projects: Project[];
  college: string;
  avatar?: string;
  isSenior: boolean;
  followingCount: number;
  followerCount: number;
  isFollowing: boolean;
  requestSent: boolean;
  isContributor?: boolean;
};

/**
 * What the app keeps for the signed-in user (cached in MMKV), normalised from AuthUser or Me
 * so screens never deal with the different list shapes.
 */
export type SessionUser = {
  _id: ObjectId;
  name: string;
  email: string;
  avatar: string;
  username: string | null;
  college: string;
  year: Year;
  branch: string;
  bio: string;
  skills: string[];
  projects: Project[];
  roadmap: string;
  isSenior: boolean;
  emailVerified: boolean;
  emailBounced: boolean;
  verificationRequired: boolean;
  followingIds: ObjectId[];
  followerIds: ObjectId[];
  followingCount: number;
  followerCount: number;
  termsAcceptedAt: IsoDate | null;
  createdAt: IsoDate;
};
