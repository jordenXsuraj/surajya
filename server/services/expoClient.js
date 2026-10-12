const { Expo } = require('expo-server-sdk')

// Expo's enhanced push security (docs/DEPLOYMENT.md, "Push security") rejects every push for
// the account's projects that comes without an access token. Production must therefore have
// EXPO_ACCESS_TOKEN: without it every push would fail, only visible as log lines, so the API
// refuses to start instead (index.js) and notify.js throws when it is loaded. Outside production
// the token is optional (local pushes need it too once the setting is on).

const MISSING = 'EXPO_ACCESS_TOKEN is not set (Expo enhanced push security needs it; see docs/DEPLOYMENT.md, "Push security").'

/** The access token, or '' when not set; throws when `required` (default: in production). */
function expoAccessToken({ env = process.env, required = env.NODE_ENV === 'production' } = {}) {
  const token = (env.EXPO_ACCESS_TOKEN || '').trim()
  if (!token && required) throw new Error(MISSING)
  return token
}

function createExpoClient(options) {
  const accessToken = expoAccessToken(options)
  return new Expo(accessToken ? { accessToken } : {})
}

module.exports = { expoAccessToken, createExpoClient }
