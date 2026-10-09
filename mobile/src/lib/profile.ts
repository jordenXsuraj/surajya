import { Platform, Share } from 'react-native';

import type { ProfileUpdate } from '@/api/endpoints/users';
import { WEB_URL } from '@/lib/links';
import { decodeEntities } from '@/lib/text';
import type { ProfileValues } from '@/lib/validation';
import type { MediaItem, Me, PublicUser, SessionUser } from '@/types/user';

/** What the profile screens show: GET /users/:id, GET /users/me or the cached session user. */
export type ProfileData = Pick<
  PublicUser,
  | '_id'
  | 'name'
  | 'avatar'
  | 'coverImage'
  | 'college'
  | 'year'
  | 'branch'
  | 'bio'
  | 'skills'
  | 'projects'
  | 'roadmap'
  | 'mediaItems'
  | 'isContributor'
  | 'followerCount'
  | 'followingCount'
> & { username?: string | null };

/** Same link the web uses (and the App Links / deep links open). */
export const profileUrl = (id: string): string => `${WEB_URL}/profile/${id}`;

export async function shareProfile(id: string, name: string): Promise<void> {
  const url = profileUrl(id);
  try {
    await Share.share(
      Platform.OS === 'ios'
        ? { title: `${name} on MeetNet`, url }
        : { title: `${name} on MeetNet`, message: url },
      { dialogTitle: 'Share profile' },
    );
  } catch {
    // dismissed or unavailable
  }
}

// Edit profile: what the form starts with and what PUT /users/me gets. Only changed fields are
// sent, so a save never touches a field the user did not edit.

type ProfileSource = Pick<
  Me | SessionUser,
  'name' | 'bio' | 'year' | 'branch' | 'skills' | 'projects' | 'roadmap'
> & { username?: string | null; mediaItems?: MediaItem[] };

export function toProfileValues(user: ProfileSource): ProfileValues {
  return {
    name: decodeEntities(user.name),
    username: user.username ?? '',
    bio: decodeEntities(user.bio ?? ''),
    year: user.year,
    branch: user.branch || 'CS',
    skills: (user.skills ?? []).map(decodeEntities),
    projects: (user.projects ?? []).map((p) => ({
      name: decodeEntities(p.name),
      link: decodeEntities(p.link ?? ''),
    })),
    roadmap: decodeEntities(user.roadmap ?? ''),
    mediaItems: (user.mediaItems ?? []).map((m) => ({ type: m.type, url: m.url })),
  };
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The PUT /users/me body: changed fields only, trimmed like the server does. */
export function buildProfileUpdate(initial: ProfileValues, values: ProfileValues): ProfileUpdate {
  const body: ProfileUpdate = {};
  if (values.name.trim() !== initial.name.trim()) body.name = values.name.trim();
  if (values.username !== initial.username && values.username !== '') {
    body.username = values.username;
  }
  if (values.bio.trim() !== initial.bio.trim()) body.bio = values.bio.trim();
  if (values.year !== initial.year) body.year = values.year;
  if (values.branch !== initial.branch) body.branch = values.branch;
  if (!sameJson(values.skills, initial.skills)) body.skills = values.skills;
  const projects = values.projects.map((p) => ({ name: p.name.trim(), link: p.link.trim() }));
  if (!sameJson(projects, initial.projects)) body.projects = projects;
  if (values.roadmap.trim() !== initial.roadmap.trim()) body.roadmap = values.roadmap.trim();
  if (!sameJson(values.mediaItems, initial.mediaItems)) {
    // PUT /users/me keeps only 'youtube' and 'instagram' items; older YouTube types are sent as
    // 'youtube' so a save does not silently drop them.
    body.mediaItems = values.mediaItems.map((m) => ({
      type: m.type === 'instagram' ? 'instagram' : 'youtube',
      url: m.url,
    }));
  }
  return body;
}

/** Where a server error message belongs on the form (username errors go under the field). */
export function profileErrorField(message: string): 'username' | 'name' | null {
  if (/^username/i.test(message)) return 'username';
  if (/^name/i.test(message)) return 'name';
  return null;
}
