// YouTube video links: watch?v=, youtu.be/, embed/, shorts/ and live/ on youtube.com and its
// www., m. and music. hosts, with or without https://. Video ids are 11 characters.
// The same rule lives in nexusnetwork/src/utils/youtube.js and mobile/src/lib/youtube.ts.
const YOUTUBE_LINK =
  /^(?:https?:\/\/)?(?:(?:www|m|music)\.)?(?:youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})(?![\w-])/i

function extractYoutubeId(url = '') {
  if (typeof url !== 'string') return ''
  const m = url.trim().match(YOUTUBE_LINK)
  return m ? m[1] : ''
}

module.exports = { extractYoutubeId }
