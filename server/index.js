const express       = require('express')
const cors          = require('cors')
const compression   = require('compression')
const helmet        = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const { rateLimit, ipKeyGenerator } = require('express-rate-limit')
const jwt           = require('jsonwebtoken')
const connectDB     = require('./config/db')
const errorHandler  = require('./middleware/errorHandler')


require('dotenv').config()
require('express-async-errors')

// ── Refuse to run production with a weak/missing JWT secret ──
if (process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  console.error('❌ JWT_SECRET is missing or shorter than 32 characters. Refusing to start in production.')
  process.exit(1)
}

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')




const xss = require('xss-clean')
const hpp = require('hpp')
const morgan = require('morgan')



app.get('/healthz', (req, res) => {
  res.status(200).send('OK')
})

// ── Compression ───────────────────────────────────
app.use(compression())

// ── Security headers ──────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// ── CORS — ONE definition only ────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:38180',
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  'https://www.themeetnet.com',
  'https://themeetnet.com'
].filter(Boolean)

const corsOptions = {
  origin: (origin, cb) => {
    // Allow no-origin (mobile apps, Postman, UptimeRobot)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
  methods:        ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','x-admin-key'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))   // handle preflight for ALL routes

// ── Sanitize MongoDB ──────────────────────────────
app.use(mongoSanitize())

// ── Rate limiting ─────────────────────────────────
// General: 600 requests per 10 min, keyed per logged-in user so students
// sharing one campus/CGNAT IP don't exhaust each other's budget.
// Login/signup limiters live in routes/auth.js.
function rateLimitKey(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      // Signature is verified (no DB hit) so forged tokens can't mint fresh buckets
      const { id } = jwt.verify(header.slice(7), process.env.JWT_SECRET)
      if (id) return `user:${id}`
    } catch { /* invalid/expired token — fall back to IP */ }
  }
  return `ip:${ipKeyGenerator(req.ip)}`
}

const generalLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit:    600,
  keyGenerator: rateLimitKey,
  message:  { message: 'Too many requests, slow down.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
})

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
// ── Body parsers ──────────────────────────────────
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true, limit: '1mb' }))


app.use(xss())
app.use(hpp())

// ── Routes ────────────────────────────────────────
app.use('/api/auth',                        require('./routes/auth'))
app.use('/api/posts',         generalLimit, require('./routes/posts'))
app.use('/api/users',         generalLimit, require('./routes/users'))
app.use('/api/notifications', generalLimit, require('./routes/notifications'))

//app.use('/api/admin',         generalLimit, require('./routes/admin'))

// ── Health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Nexus API running',
    status:  'ok',
    version: '1.0.0',
    time:    new Date().toISOString()
  })
})

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` })
})

// ── Global error handler ──────────────────────────
app.use(errorHandler)

// Only connect + listen when run directly (tests require `app` instead)
if (require.main === module) {
  connectDB()

  const PORT = process.env.PORT || 5000
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`)
    console.log(`✅ Mode: ${process.env.NODE_ENV}`)
    console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`)
  })
}

module.exports = app