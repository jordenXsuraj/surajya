
const express      = require('express')
const router       = express.Router()
const crypto       = require('crypto')
const User         = require('../models/User')
const PasswordReset = require('../models/PasswordReset')
const protect      = require('../middleware/auth')
const mailer       = require('../services/email')
const { signToken } = require('../utils/token')
const { clientIp } = require('../utils/clientIp')
const verification = require('../services/verification')
const { mustVerify } = require('../middleware/requireVerifiedEmail')

const { rateLimit, ipKeyGenerator } = require('express-rate-limit')

// Students share one public IP (campus Wi-Fi, mobile CGNAT), so login is
// limited per IP + account: brute-forcing one account is blocked without
// locking out a whole college.
function normalizeEmail(email) {
  return typeof email === 'string' ? email.toLowerCase().trim() : ''
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    10,
  keyGenerator: req => `${ipKeyGenerator(clientIp(req))}:${normalizeEmail(req.body?.email)}`,
  message:  { message: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
})

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit:    30,
  keyGenerator: req => ipKeyGenerator(clientIp(req)),
  message:  { message: 'Too many accounts created from this network. Try again later.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
})





// Helper: clean user object to send to frontend (no password)
function cleanUser(user) {
  return {
    _id:             user._id,
    name:            user.name,
    avatar:          user.avatar,
  username:        user.username,
    email:           user.email,
    college:         user.college,
    year:            user.year,
    branch:          user.branch,
    bio:             user.bio,
    skills:          user.skills,
    projects:        user.projects,
    roadmap:         user.roadmap,
    isSenior:        user.year === '4th',
    mediaItems:      user.mediaItems,
    // ✅ FIXED
    following:       user.following,
    followers:       user.followers,
    sentRequests:    user.sentRequests,
    pendingRequests: user.pendingRequests,
    termsAcceptedAt: user.termsAcceptedAt ?? null,
    emailVerified:   Boolean(user.emailVerified),
    emailBounced:    Boolean(user.emailBounced),
    verificationRequired: mustVerify(user),   // true = blocked from posting until verified

    createdAt:       user.createdAt
  }
}

// ─────────────────────────────────────────────
// POST /api/auth/signup
// ─────────────────────────────────────────────

// Add this function at top of auth.js
async function generateUsername(name) {
  const base = name
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 15)
  
  let username
  let attempts = 0
  do {
    const suffix = Math.floor(Math.random() * 9999)
    username = `${base}${suffix}`
    const exists = await User.findOne({ username })
    if (!exists) break
    attempts++
  } while (attempts < 5)
  
  return username
}


router.post('/signup', signupLimiter, async (req, res, next) => {
  try {
    const {
      name, email, password, college,
      year, branch, skills, projects, roadmap, acceptTerms
    } = req.body

    // Every text field must be a string (objects/arrays would crash .trim())
    for (const [k, v] of Object.entries({ name, email, password, college })) {
      if (v !== undefined && typeof v !== 'string') return res.status(400).json({ message: `Invalid ${k}` })
    }

    // ✅ Validate required fields
    if (!name?.trim())    return res.status(400).json({ message: 'Name is required' })
    if (!email?.trim())   return res.status(400).json({ message: 'Email is required' })
    if (!password)        return res.status(400).json({ message: 'Password is required' })
    if (!college?.trim()) return res.status(400).json({ message: 'College is required' })
    if (acceptTerms !== true) {
      return res.status(400).json({ message: 'Please accept the Terms and Privacy Policy to continue' })
    }

    // ✅ Normalize email (ONLY ONCE)
    const normalizedEmail = email.toLowerCase().trim()

    // ✅ Email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
      return res.status(400).json({ message: 'Enter a valid email address' })
    }

    // ✅ Password strength — 8+ for new accounts (login still accepts older 6-7 char passwords)
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' })
    }

    // ✅ Check duplicate
    const exists = await User.findOne({ email: normalizedEmail })
    if (exists) {
      return res.status(400).json({ message: 'An account with this email already exists' })
    }

    // ✅ Create user
    const user = await User.create({
      name:     name.trim(),
      username: await generateUsername(name),
      email:    normalizedEmail,
      password,
      college:  college.trim(),
      year:     year || '1st',
      branch:   branch?.trim() || 'CS',
      skills:   Array.isArray(skills) ? skills : [],
      projects: Array.isArray(projects)
        ? projects.filter(p => p.name?.trim())
        : [],
      roadmap:  roadmap?.trim() || '',
      termsAcceptedAt: new Date(),
    })

    const token = signToken(user)

    // Send the first verification code; signup must not fail if email does
    verification.issueCode(user).catch(err => console.error('signup: verification email failed:', err.message))

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

    if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ message: 'Email is required' })
    if (typeof password !== 'string' || !password)  return res.status(400).json({ message: 'Password is required' })

    // ✅ Normalize email
    const normalizedEmail = email.toLowerCase().trim()

    // ✅ Find user
    const user = await User.findOne({ email: normalizedEmail }).select('+password')

    // ✅ Unified error (security)
    if (!user || !(await user.matchPassword(password))) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    const token = signToken(user)

    res.json({
      token,
      user: cleanUser(user)
    })

  } catch (err) {
    next(err)
  }
})

// ─────────────────────────────────────────────
// Sessions & passwords
// ─────────────────────────────────────────────
// Wrong passwords answer 400, never 401: clients treat 401 as "session ended".

const RESET_MINUTES  = 30
const FORGOT_MESSAGE = 'If an account exists for that email, we have sent a link to reset the password.'
const INVALID_RESET  = 'This reset link is invalid or has expired. Please request a new one.'

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')

function newPasswordError(pw) {
  if (typeof pw !== 'string' || !pw) return 'New password is required'
  if (pw.length < 8)   return 'New password must be at least 8 characters'
  if (pw.length > 128) return 'New password must be at most 128 characters'
  return null
}

const limiter = (windowMs, limit, keyGenerator, message, extra = {}) => rateLimit({
  windowMs, limit, keyGenerator, message: { message },
  standardHeaders: 'draft-7', legacyHeaders: false, ...extra,
})
const changePasswordLimiter = limiter(15 * 60e3, 5, req => `user:${req.user._id}`,
  'Too many attempts. Try again in 15 minutes.')
const forgotIpLimiter = limiter(60 * 60e3, 10, req => `ip:${ipKeyGenerator(clientIp(req))}`,
  'Too many reset requests from this network. Try again later.')
const forgotEmailLimiter = limiter(60 * 60e3, 3, req => `email:${normalizeEmail(req.body?.email)}`,
  'Too many reset requests for this email. Try again later.')
const resetLimiter = limiter(15 * 60e3, 10, req => `ip:${ipKeyGenerator(clientIp(req))}`,
  'Too many attempts. Try again in 15 minutes.')

// POST /api/auth/logout-all — ends every session, returns a fresh token for this device
router.post('/logout-all', protect, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $inc: { tokenVersion: 1 }, $set: { pushTokens: [] } },
    { returnDocument: 'after' }
  ).select('tokenVersion')
  if (!user) return res.status(404).json({ message: 'User not found' })
  res.json({ message: 'Logged out of all other devices', token: signToken(user) })
})

// POST /api/auth/change-password { currentPassword, newPassword }
router.post('/change-password', protect, changePasswordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ message: 'Current password is required' })
  }
  const pwErr = newPasswordError(newPassword)
  if (pwErr) return res.status(400).json({ message: pwErr })

  const user = await User.findById(req.user._id).select('+password +pushTokens')
  if (!user || !(await user.matchPassword(currentPassword))) {
    return res.status(400).json({ message: 'Current password is incorrect' })
  }
  if (await user.matchPassword(newPassword)) {
    return res.status(400).json({ message: 'New password must be different from your current password' })
  }

  user.password     = newPassword            // hashed by the pre-save hook
  user.tokenVersion = (user.tokenVersion || 0) + 1
  user.pushTokens   = []
  await user.save({ validateModifiedOnly: true })

  res.json({ message: 'Password changed. Other devices have been logged out.', token: signToken(user) })
})

// Creates a single-use token (only its hash is stored) and emails the link.
async function createAndSendReset(addr) {
  const user = await User.findOne({ email: addr }).select('_id name email').lean()
  if (!user) return null

  const token = crypto.randomBytes(32).toString('base64url')
  await PasswordReset.deleteMany({ user: user._id })       // older links stop working
  await PasswordReset.create({
    user:      user._id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60e3),
  })

  const base = (process.env.PUBLIC_APP_URL || 'https://themeetnet.com').replace(/\/+$/, '')
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}`
  await mailer.sendPasswordReset({ to: user.email, name: user.name, link, minutes: RESET_MINUTES })
  return user._id
}

// POST /api/auth/forgot-password { email } — same answer whether or not the account exists
router.post('/forgot-password', forgotIpLimiter, forgotEmailLimiter, (req, res) => {
  const addr = normalizeEmail(req.body?.email)
  // Respond before looking anything up, so body and timing never reveal whether the account exists
  res.json({ message: FORGOT_MESSAGE })
  if (addr) createAndSendReset(addr).catch(err => console.error('forgot-password failed:', err.message))
})

// POST /api/auth/reset-password { token, newPassword }
router.post('/reset-password', resetLimiter, async (req, res) => {
  const { token, newPassword } = req.body || {}
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return res.status(400).json({ message: INVALID_RESET })
  }
  const pwErr = newPasswordError(newPassword)
  if (pwErr) return res.status(400).json({ message: pwErr })

  // Claim the token atomically: single use even if two requests race
  const reset = await PasswordReset.findOneAndUpdate(
    { tokenHash: sha256(token), used: false, expiresAt: { $gt: new Date() } },
    { $set: { used: true } },
    { returnDocument: 'after' }
  )
  if (!reset) return res.status(400).json({ message: INVALID_RESET })

  const user = await User.findById(reset.user).select('+password +pushTokens')
  if (!user) return res.status(400).json({ message: INVALID_RESET })

  user.password     = newPassword
  user.tokenVersion = (user.tokenVersion || 0) + 1
  user.pushTokens   = []
  await user.save({ validateModifiedOnly: true })
  await PasswordReset.deleteMany({ user: user._id, _id: { $ne: reset._id } })

  res.json({ message: 'Password updated. Please log in with your new password.' })
})

// ─────────────────────────────────────────────
// Email verification
// ─────────────────────────────────────────────
const verifyMessage = {
  INVALID_CODE: 'That code is not right. Check the latest email and try again.',
  CODE_LOCKED:  'Too many wrong tries. Request a new code.',
  CODE_EXPIRED: 'This code has expired. Request a new code.',
}

function rejectIfVerified(req, res, next) {
  if (req.user.emailVerified) return res.status(409).json({ code: 'ALREADY_VERIFIED', message: 'Your email is already verified.' })
  next()
}
// Per-user limits count only codes actually sent: a refused early resend must not extend the wait
const countSent = { skipFailedRequests: true }
const sendCodeMinuteLimiter = limiter(60e3, 1, req => `user:${req.user._id}`, 'Please wait a minute before asking for another code.', countSent)
const sendCodeHourLimiter   = limiter(60 * 60e3, 5, req => `user:${req.user._id}`, 'Too many codes requested. Try again in an hour.', countSent)
const sendCodeIpLimiter     = limiter(60 * 60e3, 20, req => `ip:${ipKeyGenerator(clientIp(req))}`, 'Too many codes requested from this network. Try again later.')
const verifyLimiter         = limiter(15 * 60e3, 30, req => `user:${req.user._id}`, 'Too many attempts. Try again in 15 minutes.')

// POST /api/auth/send-verification — new code to the account's current email
router.post('/send-verification', protect, rejectIfVerified, sendCodeIpLimiter, sendCodeMinuteLimiter, sendCodeHourLimiter, async (req, res) => {
  // Also honours the code sent automatically at signup / email change
  const wait = await verification.resendWaitSeconds(req.user._id)
  if (wait > 0) {
    res.set('Retry-After', String(wait))
    return res.status(429).json({ code: 'RESEND_TOO_SOON', message: `Please wait ${wait} seconds before asking for another code.`, retryAfterSeconds: wait })
  }
  const user = await User.findById(req.user._id).select('_id name email')
  const info = await verification.issueCode(user)
  res.json({ message: `We sent a new code to ${user.email}.`, ...info })
})

// POST /api/auth/verify-email { code } — returns the updated user
router.post('/verify-email', protect, verifyLimiter, async (req, res) => {
  const code = String(req.body?.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) return res.status(400).json({ code: 'INVALID_CODE', message: 'Enter the 6-digit code from the email.' })

  if (req.user.emailVerified) {
    const me = await User.findById(req.user._id)
    return res.json({ message: 'Your email is already verified.', user: cleanUser(me) })
  }

  const result = await verification.checkCode(req.user, code)
  if (!result.ok) {
    return res.status(400).json({
      code: result.code, message: verifyMessage[result.code],
      ...(result.attemptsLeft !== undefined && { attemptsLeft: result.attemptsLeft }),
    })
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $set: { emailVerified: true, emailVerifiedAt: new Date(), emailBounced: false, emailBouncedAt: null } },
    { returnDocument: 'after' }
  )
  res.json({ message: 'Email verified. Thank you!', user: cleanUser(user) })
})

module.exports = router