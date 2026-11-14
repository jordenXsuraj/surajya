// Server-side switches for features that are rolled out step by step (MeetNow, direct messages).
//
// Each feature has a mode from its env var:
//   off   (default) — the feature does not exist: its routes answer the normal 404, its socket events
//                     are refused and GET /api/app/features says false
//   staff           — only the admin account (ADMIN_EMAIL) and accounts the admin granted it to
//                     (User.featureAccess, POST /api/app/feature-access) can use it
//   on              — everyone
// Changing a mode needs a restart (Render: change the env var, then deploy). Granting or revoking an
// account in staff mode needs none.

const User = require('../models/User')

const FEATURES = {
  meetnow: 'FEATURE_MEETNOW',
  dm:      'FEATURE_DM',
}
const MODES = ['off', 'staff', 'on']

function featureMode(feature, env = process.env) {
  const v = String(env[FEATURES[feature]] || '').trim().toLowerCase()
  return MODES.includes(v) ? v : 'off'
}

const isAdmin = user => Boolean(process.env.ADMIN_EMAIL && user?.email === process.env.ADMIN_EMAIL)

// Whether `user` (a lean user, possibly without featureAccess loaded) may use `feature` now
async function hasFeature(user, feature) {
  const mode = featureMode(feature)
  if (mode === 'on') return Boolean(user)
  if (mode === 'off' || !user) return false
  if (isAdmin(user)) return true
  const access = user.featureAccess ?? (await User.findById(user._id).select('+featureAccess').lean())?.featureAccess
  return Array.isArray(access) && access.includes(feature)
}

async function featuresFor(user) {
  const out = {}
  for (const f of Object.keys(FEATURES)) out[f] = await hasFeature(user, f)
  return out
}

// Router-level gate: when the feature is off (or not granted to this account in staff mode) the
// request falls through to the app's ordinary 404, so the routes look as if they did not exist.
// Mount it before `protect`: an anonymous request then also gets a 404, never a 401.
function requireFeature(feature) {
  const { authenticate } = require('../middleware/auth')
  return async (req, res, next) => {
    const mode = featureMode(feature)
    if (mode === 'on') return next()
    if (mode === 'off') return next('router')
    try {
      const { user } = await authenticate(req)
      if (user && (await hasFeature(user, feature))) return next()
    } catch { /* invalid token: same as no access */ }
    next('router')
  }
}

module.exports = { FEATURES, featureMode, hasFeature, featuresFor, requireFeature, isAdmin }
