const fs         = require('fs')
const path       = require('path')
const crypto     = require('crypto')
const cloudinary = require('cloudinary').v2
const multer     = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')
const { uploadMode, LOCAL_UPLOAD_DIR } = require('./uploadMode')

// 'cloudinary', or 'local' outside production when Cloudinary is not configured (config/uploadMode.js)
const MODE = uploadMode()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const HEIC_TYPES  = ['image/heic', 'image/heif']
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', ...HEIC_TYPES]
const IMAGE_LIMIT = 5 * 1024 * 1024
const PDF_LIMIT   = 10 * 1024 * 1024

// A rejected file type is the client's mistake: 400 with a code (see middleware/errorHandler.js)
const invalidType = message => Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_FILE_TYPE' })

const imageFilter = (req, file, cb) => {
  if (IMAGE_TYPES.includes(file.mimetype)) cb(null, true)
  else cb(invalidType('Only image files allowed (JPG, PNG, WebP, HEIC)'), false)
}
const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true)
  else cb(invalidType('Only PDF files allowed'), false)
}

// ── Cloudinary (production) ──────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:          'nexus',
    resource_type:   'image',
    allowed_formats: ['jpg','jpeg','png','webp','heic','heif'],
    public_id: `post_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    // iPhone HEIC/HEIF is stored as JPG so every browser and Android can show it
    ...(HEIC_TYPES.includes(file.mimetype) && { format: 'jpg' }),
    transformation:  [
      { width: 1080, crop: 'limit' },
      { quality: 'auto' }
    ]
  })
})

const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'meetnet_pdfs',
    resource_type: 'raw',
    public_id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
    // NO .pdf extension — let Cloudinary handle it
  }),
})

// ── Local disk (development only) ────────────────
// Same types and limits; files keep their format (HEIC is not converted) and are served under /uploads.
const EXTENSIONS = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif', 'application/pdf': '.pdf',
}

function diskStorage(folder, prefix) {
  const dir = path.join(LOCAL_UPLOAD_DIR, folder)
  return multer.diskStorage({
    destination: (req, file, cb) => fs.mkdir(dir, { recursive: true }, err => cb(err, dir)),
    filename:    (req, file, cb) =>
      cb(null, `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${EXTENSIONS[file.mimetype]}`),
  })
}

// Cloudinary refuses files it cannot read; on disk the first bytes must match the declared type
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']
function looksLike(mimetype, head) {
  const ascii = (from, to) => head.subarray(from, to).toString('latin1')
  switch (mimetype) {
    case 'image/jpeg': return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff
    case 'image/png':  return head.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    case 'image/webp': return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'image/heic':
    case 'image/heif': return ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12))
    case 'application/pdf': return head.toString('latin1').includes('%PDF-')
    default: return false
  }
}

// After multer: check the content, then hand the routes the public URL in req.file.path
// (what Cloudinary's storage puts there), e.g. http://localhost:5000/uploads/images/post_….jpg
function finishLocal(folder) {
  return async (req, res, next) => {
    if (!req.file) return next()
    try {
      const fd = await fs.promises.open(req.file.path, 'r')
      const head = Buffer.alloc(1024)
      const { bytesRead } = await fd.read(head, 0, head.length, 0)
      await fd.close()
      if (!looksLike(req.file.mimetype, head.subarray(0, bytesRead))) {
        await fs.promises.unlink(req.file.path).catch(() => {})
        return next(invalidType('That file could not be read. Please choose another one.'))
      }
      req.file.path = `${req.protocol}://${req.get('host')}/uploads/${folder}/${req.file.filename}`
      next()
    } catch (err) {
      next(err)
    }
  }
}

// upload.single(field) works the same in both modes (locally it is [multer, check + URL])
function localUploader(instance, folder) {
  return { single: field => [instance.single(field), finishLocal(folder)] }
}

const upload = MODE === 'local'
  ? localUploader(multer({ storage: diskStorage('images', 'post'), limits: { fileSize: IMAGE_LIMIT }, fileFilter: imageFilter }), 'images')
  : multer({ storage, limits: { fileSize: IMAGE_LIMIT }, fileFilter: imageFilter })

const pdfUpload = MODE === 'local'
  ? localUploader(multer({ storage: diskStorage('pdfs', 'pdf'), limits: { fileSize: PDF_LIMIT }, fileFilter: pdfFilter }), 'pdfs')
  : multer({ storage: pdfStorage, limits: { fileSize: PDF_LIMIT }, fileFilter: pdfFilter })

module.exports = { cloudinary, upload, pdfUpload, UPLOAD_MODE: MODE }
