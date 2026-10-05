// Ported from the web (PostCard.jsx getYouTubeId).

const PATTERNS = [
  /youtube\.com\/watch\?v=([^&\s]+)/,
  /youtu\.be\/([^?\s]+)/,
  /youtube\.com\/embed\/([^?\s]+)/,
  /youtube\.com\/shorts\/([^?\s]+)/,
];

export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  for (const pattern of PATTERNS) {
    const id = url.match(pattern)?.[1];
    if (id) return id;
  }
  return null;
}

/** Web uses the "mqdefault" (320×180) thumbnail. */
export const youTubeThumbnail = (id: string): string =>
  `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
