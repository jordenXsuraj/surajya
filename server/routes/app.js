// GET /api/app/config — public, read by the mobile app on launch.
// Every value comes from env vars with safe defaults (see server/.env.example).

const express = require('express')
const router  = express.Router()

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

module.exports = router
module.exports.buildConfig = buildConfig
