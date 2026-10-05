// Where uploads (post images, avatars, covers, PDFs) are stored. Decided once at startup:
//  - 'cloudinary' when CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are all set
//  - 'local' (files in server/uploads, served under /uploads) only when NODE_ENV is not
//    'production' and none of the three is set — for local development without a Cloudinary account
// Anything else is a configuration error: production never falls back to local disk.
const path = require('path')

const CLOUDINARY_VARS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']

// The production cloud. A cloud name is public (it is part of every image URL); the keys are not.
const PRODUCTION_CLOUD_NAME = 'dc6c6x8nm'

const LOCAL_UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || path.join(__dirname, '..', 'uploads')

function uploadMode(env = process.env) {
  const missing = CLOUDINARY_VARS.filter(k => !(env[k] || '').trim())
  if (!missing.length) return 'cloudinary'
  if (env.NODE_ENV === 'production') {
    throw new Error(`Cloudinary is not configured (${missing.join(', ')} missing). Production never stores uploads on local disk.`)
  }
  if (missing.length < CLOUDINARY_VARS.length) {
    throw new Error(`Cloudinary is only partly configured (${missing.join(', ')} missing). Set all three, or none to store uploads on local disk.`)
  }
  return 'local'
}

// A development server must not write into the production cloud
function warnIfProductionCloud(env = process.env, warn = console.warn) {
  if (env.NODE_ENV === 'production') return false
  if ((env.CLOUDINARY_CLOUD_NAME || '').trim().toLowerCase() !== PRODUCTION_CLOUD_NAME) return false
  warn(
    `⚠️  CLOUDINARY_CLOUD_NAME is the PRODUCTION cloud but NODE_ENV is '${env.NODE_ENV || '(not set)'}'. ` +
    'Uploads from this server would land in production Cloudinary. ' +
    'Remove the CLOUDINARY_* values from server/.env to store uploads on local disk instead.'
  )
  return true
}

// http://<host>/uploads/<images|pdfs>/<file> → the file on disk (null for anything else)
function localUploadFile(url) {
  if (typeof url !== 'string') return null
  let pathname
  try { pathname = new URL(url).pathname } catch { return null }
  const m = pathname.match(/^\/uploads\/(images|pdfs)\/([A-Za-z0-9_-]+\.[a-z0-9]+)$/)
  return m ? path.join(LOCAL_UPLOAD_DIR, m[1], m[2]) : null
}

module.exports = { uploadMode, warnIfProductionCloud, localUploadFile, PRODUCTION_CLOUD_NAME, LOCAL_UPLOAD_DIR, CLOUDINARY_VARS }
