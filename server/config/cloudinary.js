const cloudinary = require('cloudinary').v2
const multer     = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

const HEIC_TYPES = ['image/heic', 'image/heif']

// A rejected file type is the client's mistake: 400 with a code (see middleware/errorHandler.js)
const invalidType = message => Object.assign(new Error(message), { statusCode: 400, code: 'INVALID_FILE_TYPE' })

// ── Image storage ─────────────────────────────────
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

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/png','image/webp', ...HEIC_TYPES]
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(invalidType('Only image files allowed (JPG, PNG, WebP, HEIC)'), false)
  }
})

// ── PDF storage ────────────────────────────────
// ───
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'meetnet_pdfs',
    resource_type: 'raw',
    public_id: `pdf_${Date.now()}_${Math.random().toString(36).slice(2,6)}`
    // NO .pdf extension — let Cloudinary handle it
  }),
})
const pdfUpload = multer({
  storage: pdfStorage,
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(invalidType('Only PDF files allowed'), false)
  },
})

module.exports = { cloudinary, upload, pdfUpload }