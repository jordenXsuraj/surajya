import { getYouTubeId } from '@/lib/youtube';
import type { MediaItem } from '@/types/user';

// Profile media: YouTube videos (watch, youtu.be, Shorts, live) and Instagram profile links.
// Ported from nexusnetwork/src/pages/Profile.jsx (detectMediaType, getInstagramUsername,
// MediaTab, MediaItem). Adding is stricter than the web: the web accepts any link that merely
// contains "instagram.com" (a post /p/ABC became user "ABC"); the app only takes
// instagram.com/<handle>. Rendering keeps the web's rule, so old items show the same everywhere.

export const MAX_MEDIA_ITEMS = 30; // server limit

export type MediaKind = 'youtube' | 'instagram';

/**
 * Web detectMediaType: which service a pasted link is for (not yet whether it is valid). Unlike
 * the web, "INSTAGRAM.com" counts too (host names are case-insensitive).
 */
export function detectMediaType(url: string): MediaKind | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com')) return 'instagram';
  return null;
}

// Paths on instagram.com that are not profiles
const INSTAGRAM_RESERVED = new Set([
  'p',
  'reel',
  'reels',
  'tv',
  'explore',
  'accounts',
  'stories',
  'direct',
  'about',
  'developer',
  'legal',
  'web',
  'emails',
  'challenge',
]);
const INSTAGRAM_PROFILE =
  /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i;

/** The handle of an instagram.com/<handle> profile link, or null (posts, reels, other pages). */
export function instagramHandle(url: string): string | null {
  const handle = url.trim().match(INSTAGRAM_PROFILE)?.[1];
  if (!handle || INSTAGRAM_RESERVED.has(handle.toLowerCase())) return null;
  return handle;
}

/** The web's looser rule, used only to render items saved earlier (same result as the web). */
export function instagramHandleLoose(url: string): string | null {
  if (!url) return null;
  const parts = url.split('?')[0]!.replace(/\/+$/, '').split('/');
  const name = parts[parts.length - 1];
  if (!name || ['p', 'reel', 'tv', 'explore', 'accounts'].includes(name)) return null;
  return name;
}

export type MediaHint = { ok: boolean; text: string };

/** The live hint under the link box (web MediaTab), or null while the box is empty. */
export function mediaHint(url: string): MediaHint | null {
  const value = url.trim();
  if (!value) return null;
  const type = detectMediaType(value);
  if (type === 'youtube' && getYouTubeId(value)) {
    return { ok: true, text: '✅ YouTube video detected' };
  }
  if (type === 'instagram') {
    const handle = instagramHandle(value);
    return handle
      ? { ok: true, text: `✅ Instagram profile @${handle} detected` }
      : {
          ok: false,
          text: '⚠️ Paste your Instagram profile link (instagram.com/username), not a post or reel',
        };
  }
  return { ok: false, text: '⚠️ Paste a YouTube video or Instagram profile link' };
}

const sameLink = (a: string, b: string) =>
  a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase();

export type AddMediaResult = { item: Pick<MediaItem, 'type' | 'url'> } | { error: string };

/** Checks a pasted link before adding it to the list (the form saves the list later). */
export function addMedia(items: Pick<MediaItem, 'url'>[], url: string): AddMediaResult {
  const value = url.trim();
  if (!value) return { error: 'Paste a URL first' };
  const hint = mediaHint(value);
  if (!hint?.ok) return { error: hint?.text ?? 'Only YouTube or Instagram links' };
  if (items.some((m) => sameLink(m.url, value))) return { error: 'This link is already added' };
  if (items.length >= MAX_MEDIA_ITEMS) return { error: `At most ${MAX_MEDIA_ITEMS} media items` };
  return { item: { type: detectMediaType(value)!, url: value } };
}

export type MediaView =
  | { kind: 'video'; videoId: string; short: boolean; url: string }
  | { kind: 'instagram'; handle: string; url: string };

/**
 * How one saved item is shown (web MediaItem): every YouTube type with a video id is a video card
 * (Shorts by '/shorts/' or the old 'yt-short' type); channel / playlist links without a video id
 * and unreadable Instagram links are not shown.
 */
export function mediaView(item: MediaItem): MediaView | null {
  if (item.type === 'instagram') {
    const handle = instagramHandleLoose(item.url);
    return handle ? { kind: 'instagram', handle, url: `https://instagram.com/${handle}` } : null;
  }
  const videoId = getYouTubeId(item.url);
  if (!videoId) return null;
  return {
    kind: 'video',
    videoId,
    short: item.url.includes('/shorts/') || item.type === 'yt-short',
    url: item.url,
  };
}

/** YouTube cards first, then Instagram (web: two sections). */
export function mediaSections(items: MediaItem[] | undefined): {
  videos: Extract<MediaView, { kind: 'video' }>[];
  instagram: Extract<MediaView, { kind: 'instagram' }>[];
} {
  const views = (items ?? []).map(mediaView).filter((v): v is MediaView => v !== null);
  return {
    videos: views.filter((v): v is Extract<MediaView, { kind: 'video' }> => v.kind === 'video'),
    instagram: views.filter(
      (v): v is Extract<MediaView, { kind: 'instagram' }> => v.kind === 'instagram',
    ),
  };
}
