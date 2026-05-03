const express      = require('express')
const cors         = require('cors')
const compression  = require('compression')
const helmet       = require('helmet')
const mongoSanitize= require('express-mongo-sanitize')
const rateLimit    = require('express-rate-limit')
const connectDB    = require('./config/db')
const errorHandler = require('./middleware/errorHandler')

require('dotenv').config()
require('express-async-errors')

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')

connectDB()

// ── Compression (gzip all responses) ─────────────
app.use(compression())

// ── Security headers ──────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}))

// ── CORS — must come BEFORE routes ───────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,       // e.g. https://nexus.vercel.app
  process.env.FRONTEND_URL,     // fallback alias
].filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // allow requests with no origin (mobile apps, curl, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true)
    } else {
      cb(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}))

// ── Handle OPTIONS preflight for all routes ───────
// Without this, browsers block requests like ?global=true
/*
app.options('*', cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true)
    else cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}))
*/
app.use(cors({
  origin: true,
  credentials: true,
}))

// ── Sanitize MongoDB operators in req.body ────────
app.use(mongoSanitize())

// ── Body parsers ──────────────────────────────────
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

// ── Routes ────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'))
app.use('/api/posts',         require('./routes/posts'))
app.use('/api/users',         require('./routes/users'))
app.use('/api/notifications', require('./routes/notifications'))

// ── Health check ──────────────────────────────────
app.get('/', (req, res) => {
  res.json({ message: '🚀 Nexus API running', status: 'ok' })
})

// ── 404 ───────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` })
})

// ── Global error handler ──────────────────────────
app.use(errorHandler)

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`)
  console.log(`✅ Mode: ${process.env.NODE_ENV}`)
})
