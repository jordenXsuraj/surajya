// Accounts created on/after VERIFICATION_REQUIRED_FROM must verify their email
// before they can post, reply, follow, show interest or report. Older accounts are
// never blocked (they only see a soft banner). Any doubt resolves to "not blocked".

// Deploy time of email verification; override with env VERIFICATION_REQUIRED_FROM (ISO 8601)
const DEFAULT_REQUIRED_FROM = '2026-10-05T06:35:00Z'   // release of email verification (+15 min deploy buffer)

function requiredFrom() {
  const t = Date.parse(process.env.VERIFICATION_REQUIRED_FROM || DEFAULT_REQUIRED_FROM)
  return Number.isFinite(t) ? t : Infinity      // invalid setting → never block anyone
}

function mustVerify(user) {
  if (!user || user.emailVerified) return false
  const created = new Date(user.createdAt).getTime()
  return Number.isFinite(created) && created >= requiredFrom()
}

function requireVerifiedEmail(req, res, next) {
  if (mustVerify(req.user)) {
    return res.status(403).json({
      code: 'EMAIL_NOT_VERIFIED',
      message: 'Please verify your email address first. We sent a 6-digit code to your inbox.',
    })
  }
  next()
}

module.exports = requireVerifiedEmail
module.exports.mustVerify = mustVerify
module.exports.DEFAULT_REQUIRED_FROM = DEFAULT_REQUIRED_FROM
