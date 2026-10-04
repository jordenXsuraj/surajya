const jwt = require('jsonwebtoken')

// `tv` = the user's tokenVersion when the token was issued. Bumping
// user.tokenVersion invalidates every token issued before (see middleware/auth.js).
function signToken(user) {
  return jwt.sign(
    { id: user._id, tv: user.tokenVersion || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  )
}

// Tokens issued before tokenVersion existed carry no `tv`; they stay valid
// only while the user has never bumped their version.
function tokenVersionMatches(decoded, user) {
  const current = user.tokenVersion || 0
  return decoded.tv === undefined ? current === 0 : decoded.tv === current
}

module.exports = { signToken, tokenVersionMatches }
