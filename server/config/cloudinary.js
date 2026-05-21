

const cloudinary = require('cloudinary').v2
const multer     = require('multer')
const { CloudinaryStorage } = require('multer-storage-cloudinary')

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

// ✅ ENV check
if (!process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET) {
  
}

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: 'nexus',
    resource_type: 'image',
    allowed_formats: ['jpg','jpeg','png','webp'],
    public_id: `post_${Date.now()}`,
    transformation: [
      { width: 1080, crop: 'limit' },
      { quality: 'auto' }
    ]
  })
})

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only image files allowed'), false)
    }
  }
})

const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder:         'meetnet_pdfs',
    resource_type:  'raw',          // ← IMPORTANT: PDFs must use 'raw' not 'image'
    allowed_formats: ['pdf'],
    public_id:      `pdf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }),
})

const pdfUpload = multer({
  storage: pdfStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files allowed'), false)
    }
  },
})

//module.exports = { }  // ← add pdfUpload to existing exports

module.exports = { cloudinary, upload , upload, pdfUpload}