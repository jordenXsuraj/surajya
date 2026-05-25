module.exports = function errorHandler(err, req, res, next) {
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
    message: status === 500
      ? 'Server error. Please try again later.'
      : err.message
  })
}