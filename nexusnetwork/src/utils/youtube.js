// YouTube video links: watch?v=, youtu.be/, embed/, shorts/ and live/ on youtube.com and its
// www., m. and music. hosts, with or without https://. Video ids are 11 characters.
// Same rule as the server (server/utils/youtube.js) and the app (mobile/src/lib/youtube.ts).
const YOUTUBE_LINK =
  /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i

/** The video id, or null when the link is not a YouTube video. */
export function getYouTubeId(url) {
  if (typeof url !== 'string') return null
  const m = url.trim().match(YOUTUBE_LINK)
  return m ? m[1] : null
}
