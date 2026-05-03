
const express      = require('express')
const router       = express.Router()
const jwt          = require('jsonwebtoken')
const User         = require('../models/User')

// Helper: generate JWT
function makeToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' })
}

const rateLimit = require('express-rate-limit')

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts, try later'
})





// Helper: clean user object to send to frontend (no password)
function cleanUser(user) {
  return {
    _id:             user._id,
    name:            user.name,
    email:           user.email,
    college:         user.college,
    year:            user.year,
    branch:          user.branch,
    bio:             user.bio,
    skills:          user.skills,
    projects:        user.projects,
    roadmap:         user.roadmap,
    isSenior:        user.year === '4th',

    // ✅ FIXED
    following:       user.following,
    followers:       user.followers,
    sentRequests:    user.sentRequests,
    pendingRequests: user.pendingRequests,

    createdAt:       user.createdAt
  }
}

// ─────────────────────────────────────────────
// POST /api/auth/signup
// ─────────────────────────────────────────────
router.post('/signup',async (req, res, next) => {
  try {
    const {
      name, email, password, college,
      year, branch, skills, projects, roadmap
    } = req.body

    // ✅ Validate required fields
    if (!name?.trim())    return res.status(400).json({ message: 'Name is required' })
    if (!email?.trim())   return res.status(400).json({ message: 'Email is required' })
    if (!password)        return res.status(400).json({ message: 'Password is required' })
    if (!college?.trim()) return res.status(400).json({ message: 'College is required' })

    // ✅ Normalize email (ONLY ONCE)
    const normalizedEmail = email.toLowerCase().trim()

    // ✅ Email format
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    // ✅ Password strength
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' })
    }

    // ✅ Check duplicate
    const exists = await User.findOne({ email: normalizedEmail })
    if (exists) {
      return res.status(400).json({ message: 'An account with this email already exists' })
    }

    // ✅ Create user
    const user = await User.create({
      name:     name.trim(),
      email:    normalizedEmail,
      password,
      college:  college.trim(),
      year:     year || '1st',
      branch:   branch?.trim() || 'CS',
      skills:   Array.isArray(skills) ? skills : [],
      projects: Array.isArray(projects)
        ? projects.filter(p => p.name?.trim())
        : [],
      roadmap:  roadmap?.trim() || ''
    })

    const token = makeToken(user._id)

    res.status(201).json({
      token,
      user: cleanUser(user)
    })

  } catch (err) {
    next(err)
  }
})


// ─────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body

    if (!email?.trim()) return res.status(400).json({ message: 'Email is required' })
    if (!password)      return res.status(400).json({ message: 'Password is required' })

    // ✅ Normalize email
    const normalizedEmail = email.toLowerCase().trim()

    // ✅ Find user
    const user = await User.findOne({ email: normalizedEmail }).select('+password')

    // ✅ Unified error (security)
    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    const token = makeToken(user._id)

    res.json({
      token,
      user: cleanUser(user)
    })

  } catch (err) {
    next(err)
  }
})

module.exports = router