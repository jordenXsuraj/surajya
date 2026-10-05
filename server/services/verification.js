// 6-digit email verification codes. Only a keyed hash is stored, every guess is
// counted before it is compared, and a code dies after 5 wrong guesses or 10 minutes.

const crypto = require('crypto')
const EmailVerification = require('../models/EmailVerification')
const mailer = require('./email')

const CODE_MINUTES   = 10
const MAX_ATTEMPTS   = 5
const RESEND_SECONDS = 60

// HMAC-SHA256 keyed with the server secret and bound to the user: a leaked
// database can't be brute-forced offline (a plain hash of 1,000,000 codes could).
function hashCode(userId, code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev-only-secret')
    .update(`${userId}:${code}`).digest('hex')
}

const sameHash = (a, b) => {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex')
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Seconds until another code may be sent (0 = now). Covers the code sent at signup too.
async function resendWaitSeconds(userId) {
  const latest = await EmailVerification.findOne({ user: userId }).sort({ createdAt: -1 }).select('createdAt').lean()
  if (!latest) return 0
  const left = RESEND_SECONDS - Math.floor((Date.now() - latest.createdAt.getTime()) / 1000)
  return Math.max(0, left)
}

// Replaces any older code and emails a new one to user.email.
async function issueCode(user) {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  await EmailVerification.deleteMany({ user: user._id })
  await EmailVerification.create({
    user:      user._id,
    email:     user.email,
    codeHash:  hashCode(user._id, code),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60e3),
  })
  await mailer.sendVerificationCode({ to: user.email, name: user.name, code, minutes: CODE_MINUTES })
  return { expiresInSeconds: CODE_MINUTES * 60, resendAfterSeconds: RESEND_SECONDS }
}

// → { ok: true } | { ok: false, code: 'CODE_EXPIRED'|'CODE_LOCKED'|'INVALID_CODE', attemptsLeft? }
async function checkCode(user, code) {
  // Count the attempt BEFORE comparing, so parallel guesses can't exceed the limit
  const doc = await EmailVerification.findOneAndUpdate(
    { user: user._id, attempts: { $lt: MAX_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { returnDocument: 'after', sort: { createdAt: -1 } }
  ).lean()

  if (!doc) {
    const exists = await EmailVerification.exists({ user: user._id })
    return { ok: false, code: exists ? 'CODE_LOCKED' : 'CODE_EXPIRED' }
  }
  // Wrong address (email changed since) or expired: treat as expired
  if (doc.email !== user.email || doc.expiresAt <= new Date()) {
    await EmailVerification.deleteOne({ _id: doc._id })
    return { ok: false, code: 'CODE_EXPIRED' }
  }
  if (!sameHash(doc.codeHash, hashCode(user._id, code))) {
    const attemptsLeft = MAX_ATTEMPTS - doc.attempts
    return { ok: false, code: attemptsLeft > 0 ? 'INVALID_CODE' : 'CODE_LOCKED', attemptsLeft }
  }
  await EmailVerification.deleteMany({ user: user._id })
  return { ok: true }
}

module.exports = { issueCode, checkCode, resendWaitSeconds, hashCode, CODE_MINUTES, MAX_ATTEMPTS, RESEND_SECONDS }
