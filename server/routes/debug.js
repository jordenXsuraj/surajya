// TEMPORARY diagnostics. GET /api/_debug/ip shows the caller's own proxy
// headers so CLIENT_IP_HEADER can be chosen (docs/DEPLOYMENT.md, "Client IP").
// Invisible (normal 404) unless DEBUG_IP_ROUTE=1 AND x-admin-key matches AND
// the JWT belongs to ADMIN_EMAIL. Nothing here is logged.

const express = require('express')
const crypto  = require('crypto')
const protect = require('../middleware/auth')
const { clientIp } = require('../utils/clientIp')

const router = express.Router()

const safeEqual = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

function gate(req, res, next) {
  if (process.env.DEBUG_IP_ROUTE !== '1') return next('router')
  if (!process.env.ADMIN_SECRET_KEY || !safeEqual(req.headers['x-admin-key'], process.env.ADMIN_SECRET_KEY)) {
    return next('router')
  }
  next()
}

router.get('/ip', gate, protect, (req, res, next) => {
  if (!process.env.ADMIN_EMAIL || req.user.email !== process.env.ADMIN_EMAIL) return next('router')
  const h = name => req.headers[name] ?? null
  res.set('Cache-Control', 'no-store')
  res.json({
    reqIp:    req.ip,
    reqIps:   req.ips,
    clientIp: clientIp(req),
    headers: {
      'x-forwarded-for':  h('x-forwarded-for'),
      'cf-connecting-ip': h('cf-connecting-ip'),
      'true-client-ip':   h('true-client-ip'),
      'x-real-ip':        h('x-real-ip'),
    },
    config: {
      CLIENT_IP_HEADER:    process.env.CLIENT_IP_HEADER || null,
      CLIENT_IP_XFF_INDEX: process.env.CLIENT_IP_XFF_INDEX || null,
    },
  })
})

module.exports = router
