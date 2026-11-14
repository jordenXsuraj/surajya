// GET /api/app/config — public, read by the mobile app on launch.
// Every value comes from env vars with safe defaults (see server/.env.example).
// GET /api/app/features — the signed-in account's access to staged features (config/features.js).
// /api/app/feature-access — the admin's allowlist for features in `staff` mode.

const crypto  = require('crypto')
const express = require('express')
const router  = express.Router()
const protect = require('../middleware/auth')
const User    = require('../models/User')
const { FEATURES, featureMode, featuresFor, isAdmin } = require('../config/features')

const VERSION = /^\d+\.\d+\.\d+$/

function version(name, fallback) {
  const v = (process.env[name] || '').trim()
  return VERSION.test(v) ? v : fallback
}

function flag(name, fallback) {
  const v = (process.env[name] || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return fallback
}

const text = (name, fallback = '') => (process.env[name] || fallback).trim()

function buildConfig() {
  return {
    minVersion: {
      ios:     version('APP_MIN_VERSION_IOS', '0.0.0'),
      android: version('APP_MIN_VERSION_ANDROID', '0.0.0'),
    },
    latestVersion: {
      ios:     version('APP_LATEST_VERSION_IOS', '1.0.0'),
      android: version('APP_LATEST_VERSION_ANDROID', '1.0.0'),
    },
    storeUrl: {
      ios:     text('APP_STORE_URL_IOS'),
      android: text('APP_STORE_URL_ANDROID', 'https://play.google.com/store/apps/details?id=com.themeetnet.app'),
    },
    features: {
      confessionsEnabled: {
        ios:     flag('APP_CONFESSIONS_IOS', true),
        android: flag('APP_CONFESSIONS_ANDROID', true),
      },
      pdfUploads: flag('APP_PDF_UPLOADS', true),
      // true only when the feature is on for everyone (FEATURE_MEETNOW / FEATURE_DM = on).
      // In `staff` mode it stays false here: this response is public and cached, so per-account
      // access comes from GET /api/app/features.
      meetnowEnabled: featureMode('meetnow') === 'on',
      dmEnabled:      featureMode('dm') === 'on',
    },
    maintenance: {
      enabled: flag('APP_MAINTENANCE', false),
      message: text('APP_MAINTENANCE_MESSAGE'),
    },
  }
}

router.get('/config', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60')
  res.json(buildConfig())
})

// What this account may use. Private and never cached: it differs per account.
router.get('/features', protect, async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  res.json(await featuresFor(req.user))
})

// ── Admin: allowlist for staff mode ──────────────
// Needs the admin account's token AND the admin key (like the admin reports); anything else is the
// normal 404, so the route is invisible.
const safeEqual = (a, b) =>
  typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

function adminKey(req, res, next) {
  if (!process.env.ADMIN_SECRET_KEY || !safeEqual(req.headers['x-admin-key'], process.env.ADMIN_SECRET_KEY)) {
    return next('router')
  }
  next()
}
const adminOnly = (req, res, next) => (isAdmin(req.user) ? next() : next('router'))

// GET /api/app/feature-access → { modes: { meetnow, dm }, accounts: [{ _id, name, email, features }] }
router.get('/feature-access', adminKey, protect, adminOnly, async (req, res) => {
  res.set('Cache-Control', 'private, no-store')
  const accounts = await User.find({ featureAccess: { $exists: true, $ne: [] } })
    .select('name email +featureAccess').sort({ name: 1 }).limit(200).lean()
  const modes = Object.fromEntries(Object.keys(FEATURES).map(f => [f, featureMode(f)]))
  res.json({ modes, accounts: accounts.map(u => ({ _id: u._id, name: u.name, email: u.email, features: u.featureAccess })) })
})

// POST /api/app/feature-access { email, feature: 'meetnow'|'dm', grant: true|false }
router.post('/feature-access', adminKey, protect, adminOnly, async (req, res) => {
  const { email, feature, grant } = req.body || {}
  if (typeof email !== 'string' || !email.trim()) return res.status(400).json({ message: 'Email is required' })
  if (!Object.keys(FEATURES).includes(feature)) return res.status(400).json({ message: 'Unknown feature' })
  if (typeof grant !== 'boolean') return res.status(400).json({ message: 'grant must be true or false' })
  const user = await User.findOneAndUpdate(
    { email: email.trim().toLowerCase() },
    grant ? { $addToSet: { featureAccess: feature } } : { $pull: { featureAccess: feature } },
    { returnDocument: 'after', projection: { name: 1, email: 1, featureAccess: 1 } },
  ).lean()
  if (!user) return res.status(404).json({ message: 'No account with that email' })
  res.set('Cache-Control', 'private, no-store')
  res.json({ _id: user._id, name: user.name, email: user.email, features: user.featureAccess })
})

module.exports = router
module.exports.buildConfig = buildConfig
