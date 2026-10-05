module.exports = function errorHandler(err, req, res, next) {
  // Request from an Origin not in the CORS allow-list (expected, not worth a log line)
  if (err.code === 'CORS_ORIGIN_NOT_ALLOWED') {
    return res.status(403).json({ message: 'Origin not allowed' })
  }

  if (process.env.NODE_ENV !== 'production') {
  console.error('❌ Error:', err)
} else {
  console.error('❌ Error:', err.message)
}

  // Duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0]
    return res.status(400).json({
      message: `An account with this ${field} already exists`
    })
  }

  // Validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(e => e.message)
    return res.status(400).json({ message: messages[0] })
  }

  // Invalid ObjectId
  if (err.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid ID format' })
  }

  // Uploads: size limit and other multer limits (field 'pdf' = 10 MB, images = 5 MB)
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        code: 'FILE_TOO_LARGE',
        message: err.field === 'pdf' ? 'PDF is too large (max 10 MB)' : 'Image is too large (max 5 MB)',
      })
    }
    return res.status(400).json({ code: err.code, message: err.message })
  }

  // Uploads: Cloudinary refused the file itself (e.g. not really an image)
  if (err.http_code === 400) {
    return res.status(400).json({ code: 'INVALID_FILE_TYPE', message: 'That file could not be read. Please choose another one.' })
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ message: 'Invalid token' })
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ message: 'Token expired' })
  }

  // Default
  const status = err.statusCode || 500

  res.status(status).json({
    ...(status !== 500 && typeof err.code === 'string' && { code: err.code }),
    message: status === 500
      ? 'Server error. Please try again later.'
      : err.message
  })
}