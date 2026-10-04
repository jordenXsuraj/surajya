


const jwt  = require('jsonwebtoken')
const User = require('../models/User')
const { tokenVersionMatches } = require('../utils/token')

// Verifies the Bearer token and loads the user. Returns { user } or { error }.
async function authenticate(req) {
  const header = req.headers.authorization

  if (!header || !header.startsWith('Bearer ')) {
    return { error: 'No token. Please log in.' }
  }

  const parts = header.split(' ')
  if (parts.length !== 2) {
    return { error: 'Invalid authorization format' }
  }

  const decoded = jwt.verify(parts[1], process.env.JWT_SECRET)

  const user = await User.findById(decoded.id)
    .select('-password')
    .lean()

  if (!user) {
    return { error: 'User not found. Please log in again.' }
  }

  // Logged out everywhere / password changed since this token was issued
  if (!tokenVersionMatches(decoded, user)) {
    return { error: 'Session expired. Please log in again.' }
  }

  return { user }
}

module.exports = async function protect(req, res, next) {
  try {
    const { user, error } = await authenticate(req)
    if (error) return res.status(401).json({ message: error })

    req.user = user
    next()

  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired. Please log in again.' })
    }

    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token. Please log in.' })
    }

    console.error('Auth error:', err)
    return res.status(401).json({ message: 'Authentication failed' })
  }
}

// For public routes that behave differently for a logged-in viewer
// (e.g. block filtering). Never rejects: a missing/invalid token = anonymous.
module.exports.optional = async function optionalAuth(req, res, next) {
  try {
    const { user } = await authenticate(req)
    if (user) req.user = user
  } catch { /* treat as logged out */ }
  next()
}
