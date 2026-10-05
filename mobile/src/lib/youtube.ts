// YouTube video links: watch?v=, youtu.be/, embed/, shorts/ and live/ on youtube.com and its
// www., m. and music. hosts, with or without https://. Video ids are 11 characters.
// Same rule as the server (server/utils/youtube.js) and the web (nexusnetwork/src/utils/youtube.js).
const YOUTUBE_LINK =
  /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i;

/** The video id, or null when the link is not a YouTube video. */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  return url.trim().match(YOUTUBE_LINK)?.[1] ?? null;
}

/** Web uses the "mqdefault" (320×180) thumbnail. */
export const youTubeThumbnail = (id: string): string =>
  `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
