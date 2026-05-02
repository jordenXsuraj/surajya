


const jwt  = require('jsonwebtoken')
const User = require('../models/User')

module.exports = async function protect(req, res, next) {
  try {
    const header = req.headers.authorization

    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token. Please log in.' })
    }

    const parts = header.split(' ')
    if (parts.length !== 2) {
      return res.status(401).json({ message: 'Invalid authorization format' })
    }

    const token = parts[1]

    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const user = await User.findById(decoded.id)
      .select('-password')
      .lean()

    if (!user) {
      return res.status(401).json({ message: 'User not found. Please log in again.' })
    }

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