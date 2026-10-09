import {
  addMedia,
  detectMediaType,
  instagramHandle,
  instagramHandleLoose,
  MAX_MEDIA_ITEMS,
  mediaHint,
  mediaSections,
  mediaView,
} from '@/lib/media';

describe('detectMediaType (web Profile.jsx)', () => {
  it.each([
    ['https://www.youtube.com/watch?v=aqz-KE-bpKQ', 'youtube'],
    ['youtu.be/ScMzIvxBSi4', 'youtube'],
    ['https://instagram.com/meera.codes', 'instagram'],
    ['https://example.com', null],
    ['', null],
  ])('%s → %s', (url, type) => expect(detectMediaType(url)).toBe(type));
});

describe('instagramHandle (adding: profile links only)', () => {
  it.each([
    ['https://www.instagram.com/meera.codes/', 'meera.codes'],
    ['instagram.com/arjun_builds', 'arjun_builds'],
    ['https://instagram.com/Some.User?igsh=abc', 'Some.User'],
    ['https://m.instagram.com/someone', 'someone'],
  ])('accepts %s', (url, handle) => expect(instagramHandle(url)).toBe(handle));

  it.each([
    'https://www.instagram.com/p/ABC123/', // a post: the web took "ABC123" as the user
    'https://www.instagram.com/reel/XYZ/',
    'https://www.instagram.com/explore',
    'https://www.instagram.com/',
    'https://www.instagram.com/a/b',
    'https://evil.com/instagram.com/user',
    'https://instagram.com/bad handle',
  ])('refuses %s', (url) => expect(instagramHandle(url)).toBeNull());
});

describe('instagramHandleLoose (rendering items saved on the web)', () => {
  it('keeps the web result for old items', () => {
    expect(instagramHandleLoose('https://www.instagram.com/p/ABC123/')).toBe('ABC123');
    expect(instagramHandleLoose('https://instagram.com/meera.codes/?x=1')).toBe('meera.codes');
    expect(instagramHandleLoose('https://www.instagram.com/reel')).toBeNull();
  });
});

describe('mediaHint (the live text under the link box)', () => {
  it('uses the web texts', () => {
    expect(mediaHint('')).toBeNull();
    expect(mediaHint('https://youtu.be/ScMzIvxBSi4')).toEqual({
      ok: true,
      text: '✅ YouTube video detected',
    });
    expect(mediaHint('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.ok).toBe(true);
    expect(mediaHint('https://instagram.com/meera.codes')).toEqual({
      ok: true,
      text: '✅ Instagram profile @meera.codes detected',
    });
    expect(mediaHint('https://instagram.com/p/xyz')).toEqual({
      ok: false,
      text: '⚠️ Paste your Instagram profile link (instagram.com/username), not a post or reel',
    });
    expect(mediaHint('https://www.youtube.com/@Blender')).toEqual({
      ok: false,
      text: '⚠️ Paste a YouTube video or Instagram profile link',
    });
    expect(mediaHint('hello')?.ok).toBe(false);
  });
});

describe('addMedia', () => {
  it('adds a valid link with its type', () => {
    expect(addMedia([], ' https://youtu.be/ScMzIvxBSi4 ')).toEqual({
      item: { type: 'youtube', url: 'https://youtu.be/ScMzIvxBSi4' },
    });
    expect(addMedia([], 'instagram.com/meera.codes')).toEqual({
      item: { type: 'instagram', url: 'instagram.com/meera.codes' },
    });
  });

  it('refuses empty, invalid, duplicate and too many', () => {
    expect(addMedia([], '  ')).toEqual({ error: 'Paste a URL first' });
    expect(addMedia([], 'https://instagram.com/p/xyz')).toHaveProperty('error');
    expect(
      addMedia(
        [{ url: 'https://instagram.com/meera.codes/' }],
        'https://INSTAGRAM.com/meera.codes',
      ),
    ).toEqual({
      error: 'This link is already added',
    });
    const full = Array.from({ length: MAX_MEDIA_ITEMS }, (_, i) => ({
      url: `https://instagram.com/u${i}`,
    }));
    expect(addMedia(full, 'https://youtu.be/ScMzIvxBSi4')).toEqual({
      error: 'At most 30 media items',
    });
  });
});

describe('mediaView / mediaSections (web MediaItem rules)', () => {
  it('shows every YouTube type that has a video id, Shorts as Shorts', () => {
    expect(
      mediaView({ type: 'youtube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' }),
    ).toEqual({
      kind: 'video',
      videoId: 'aqz-KE-bpKQ',
      short: false,
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
    });
    expect(
      mediaView({ type: 'youtube', url: 'https://youtube.com/shorts/dQw4w9WgXcQ' }),
    ).toMatchObject({
      short: true,
    });
    expect(mediaView({ type: 'yt-short', url: 'https://youtu.be/dQw4w9WgXcQ' })).toMatchObject({
      short: true,
    });
    expect(
      mediaView({
        type: 'yt-playlist',
        url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL1',
      }),
    ).toMatchObject({ kind: 'video', videoId: 'jNQXAC9IVRw' });
  });

  it('hides channel links and unreadable Instagram links (as the web does)', () => {
    expect(mediaView({ type: 'yt-channel', url: 'https://www.youtube.com/@Blender' })).toBeNull();
    expect(mediaView({ type: 'instagram', url: 'https://www.instagram.com/reel' })).toBeNull();
  });

  it('splits into YouTube then Instagram, keeping every item (no limit of 6)', () => {
    const items = [
      { type: 'instagram' as const, url: 'https://instagram.com/a' },
      ...Array.from({ length: 8 }, () => ({
        type: 'youtube' as const,
        url: 'https://youtu.be/ScMzIvxBSi4',
      })),
      { type: 'yt-channel' as const, url: 'https://www.youtube.com/@Blender' },
    ];
    const { videos, instagram } = mediaSections(items);
    expect(videos).toHaveLength(8);
    expect(instagram.map((v) => v.handle)).toEqual(['a']);
    expect(mediaSections(undefined)).toEqual({ videos: [], instagram: [] });
  });
});
