import { buildProfileUpdate, profileErrorField, toProfileValues } from '@/lib/profile';
import {
  changePasswordSchema,
  normaliseUsername,
  profileSchema,
  type ProfileValues,
} from '@/lib/validation';
import { sessionUser } from '@/test/helpers';

const base: ProfileValues = {
  name: 'Asha Patil',
  username: 'asha',
  bio: 'Hi',
  year: '2nd',
  branch: 'CS',
  skills: ['React'],
  projects: [{ name: 'Notes', link: 'github.com/a/notes' }],
  roadmap: '',
  mediaItems: [{ type: 'youtube', url: 'https://youtu.be/ScMzIvxBSi4' }],
};

describe('username', () => {
  it('is lowercased and stripped like the web, max 20', () => {
    expect(normaliseUsername('Ab C')).toBe('abc');
    expect(normaliseUsername('Asha_P.2026!')).toBe('asha_p.2026');
    expect(normaliseUsername('a'.repeat(30))).toHaveLength(20);
  });

  it('the field keeps the text as typed; validation and the save use it normalised', () => {
    // SwiftKey regression: rewriting the text while it was typed doubled letters ("aabaabc"), so
    // the field no longer does that; what it holds is normalised here (and on blur)
    const schema = profileSchema(true);
    const saved = (username: string) => {
      const r = schema.safeParse({ ...base, username });
      return r.success ? r.data.username : null;
    };
    expect(saved('Ab C')).toBe('abc');
    expect(saved('Asha')).toBe('asha');
    expect(saved('asha patil')).toBe('ashapatil');
    expect(saved('a'.repeat(21))).toBe('a'.repeat(20));
  });

  it('needs 3–20 of a-z 0-9 _ . after normalising (the route refuses more than 20)', () => {
    const schema = profileSchema(true);
    const check = (username: string) => schema.safeParse({ ...base, username }).success;
    expect(check('abc')).toBe(true);
    expect(check('a.b_c.2026')).toBe(true);
    expect(check('ab')).toBe(false);
    expect(check('a!b')).toBe(false); // "ab": too short once the "!" is dropped
    expect(check('!!!')).toBe(false);
  });

  it('may stay empty only for an account that never had one', () => {
    expect(profileSchema(false).safeParse({ ...base, username: '' }).success).toBe(true);
    expect(profileSchema(true).safeParse({ ...base, username: '' }).success).toBe(false);
  });
});

describe('profileSchema limits (PUT /users/me)', () => {
  const schema = profileSchema(true);
  const message = (patch: Partial<ProfileValues>) => {
    const result = schema.safeParse({ ...base, ...patch });
    return result.success ? null : result.error.issues[0]?.message;
  };

  it('uses the server messages', () => {
    expect(message({ name: '   ' })).toBe('Name cannot be empty');
    expect(message({ name: 'x'.repeat(61) })).toBe('Name can be at most 60 characters');
    expect(message({ bio: 'x'.repeat(251) })).toBe('Bio can be at most 250 characters');
    expect(message({ projects: [{ name: 'x'.repeat(61), link: '' }] })).toBe(
      'Project names can be at most 60 characters',
    );
    expect(message({ projects: [{ name: ' ', link: '' }] })).toBe('Project name required');
    expect(message({ roadmap: 'x'.repeat(1001) })).toBe('Roadmap can be at most 1000 characters');
    expect(message({})).toBeNull();
  });
});

describe('buildProfileUpdate', () => {
  it('sends nothing when nothing changed', () => {
    expect(buildProfileUpdate(base, { ...base })).toEqual({});
  });

  it('sends only the changed fields, trimmed', () => {
    expect(
      buildProfileUpdate(base, {
        ...base,
        bio: '  New bio  ',
        year: '3rd',
        skills: ['React', 'Node.js'],
        projects: [{ name: ' Notes v2 ', link: ' github.com/a/notes ' }],
      }),
    ).toEqual({
      bio: 'New bio',
      year: '3rd',
      skills: ['React', 'Node.js'],
      projects: [{ name: 'Notes v2', link: 'github.com/a/notes' }],
    });
  });

  it('never sends an empty username (accounts from before usernames)', () => {
    const noUsername = { ...base, username: '' };
    expect(buildProfileUpdate(noUsername, { ...noUsername, bio: 'x' })).toEqual({ bio: 'x' });
    expect(buildProfileUpdate(noUsername, { ...noUsername, username: 'asha.p' })).toEqual({
      username: 'asha.p',
    });
  });

  it('keeps older YouTube item types by sending them as youtube', () => {
    const initial = {
      ...base,
      mediaItems: [{ type: 'yt-short' as const, url: 'https://youtu.be/dQw4w9WgXcQ' }],
    };
    expect(
      buildProfileUpdate(initial, {
        ...initial,
        mediaItems: [...initial.mediaItems, { type: 'instagram', url: 'instagram.com/asha' }],
      }).mediaItems,
    ).toEqual([
      { type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      { type: 'instagram', url: 'instagram.com/asha' },
    ]);
  });
});

describe('toProfileValues', () => {
  it('decodes the HTML-escaped text the API returns', () => {
    const values = toProfileValues(
      sessionUser({ bio: 'a &lt; b', roadmap: 'x', username: null, skills: ['C&lt;3'] }),
    );
    expect(values.bio).toBe('a < b');
    expect(values.username).toBe('');
    expect(values.skills).toEqual(['C<3']);
  });
});

describe('profileErrorField', () => {
  it('puts username and name messages under their fields', () => {
    expect(profileErrorField('Username already taken')).toBe('username');
    expect(profileErrorField('Username too long')).toBe('username');
    expect(profileErrorField('Name cannot be empty')).toBe('name');
    expect(profileErrorField('Server error')).toBeNull();
  });
});

describe('changePasswordSchema (web AccountSettings messages)', () => {
  const message = (current: string, next: string, repeat: string) => {
    const result = changePasswordSchema.safeParse({ current, next, repeat });
    return result.success ? null : result.error.issues[0]?.message;
  };
  it('checks one thing at a time', () => {
    expect(message('', 'longenough', 'longenough')).toBe('Enter your current password');
    expect(message('old', 'short', 'short')).toBe('New password must be at least 8 characters');
    expect(message('old', 'longenough', 'different')).toBe("New passwords don't match");
    expect(message('old', 'longenough', 'longenough')).toBeNull();
  });
});
