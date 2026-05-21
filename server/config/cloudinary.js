const cloudinary = require('cloudinary').v2
const multer     = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// ── Image storage ─────────────────────────────────
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:          'nexus',
    resource_type:   'image',
    allowed_formats: ['jpg','jpeg','png','webp'],
    public_id:       `post_${Date.now()}`,
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
    const allowed = ['image/jpeg','image/png','image/webp']
    if (allowed.includes(file.mimetype)) cb(null, true)
    else cb(new Error('Only image files allowed'), false)
  }
})

// ── PDF storage ────────────────────────────────
// ───
const pdfStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:        'meetnet_pdfs',
    resource_type: 'raw',          // must be raw for PDFs
    public_id:     `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    // NO allowed_formats — causes issues with some accounts
    // NO flags — apply fl_inline in frontend URL instead
  }),
})

const pdfUpload = multer({
  storage: pdfStorage,
  limits:  { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true)
    else cb(new Error('Only PDF files allowed'), false)
  },
})

module.exports = { cloudinary, upload, pdfUpload }