// POST /api/webhooks/resend — Resend delivery events (optional; see docs/DEPLOYMENT.md).
// Exists only when RESEND_WEBHOOK_SECRET is set. Requests are signed with Svix:
//   signature = base64(HMAC-SHA256(base64decode(secret without "whsec_"), `${id}.${timestamp}.${rawBody}`))
// On email.bounced / email.complained, marks the matching users emailBounced=true.

const express = require('express')
const crypto  = require('crypto')
const User    = require('../models/User')

const router = express.Router()
const TOLERANCE_SECONDS = 5 * 60

function verifySvix(secret, headers, rawBody) {
  const id = headers['svix-id'], ts = headers['svix-timestamp'], sigHeader = headers['svix-signature']
  if (!id || !ts || !sigHeader || typeof rawBody !== 'string') return false
  const timestamp = Number(ts)
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false

  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest()
  // Header holds space-separated "v1,<base64>" entries (several during secret rotation)
  return String(sigHeader).split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const given = Buffer.from(sig, 'base64')
    return given.length === expected.length && crypto.timingSafeEqual(given, expected)
  })
}

router.post('/resend', async (req, res, next) => {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return next('router')                       // feature off → normal 404

  if (!verifySvix(secret, req.headers, req.rawBody)) {
    return res.status(401).json({ message: 'Invalid signature' })
  }

  const event = req.body || {}
  if (event.type === 'email.bounced' || event.type === 'email.complained') {
    const to = (Array.isArray(event.data?.to) ? event.data.to : [event.data?.to])
      .filter(t => typeof t === 'string').map(t => t.trim().toLowerCase())
    if (to.length) {
      const r = await User.updateMany(
        { email: { $in: to }, emailBounced: { $ne: true } },
        { $set: { emailBounced: true, emailBouncedAt: new Date() } }
      )
      console.log(`resend webhook: ${event.type} → ${r.modifiedCount} user(s) marked emailBounced`)
    }
  }
  res.json({ ok: true })
})

module.exports = router
module.exports.verifySvix = verifySvix
