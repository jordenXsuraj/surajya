const express       = require('express')
const cors          = require('cors')
const compression   = require('compression')
const helmet        = require('helmet')
const mongoSanitize = require('express-mongo-sanitize')
const rateLimit     = require('express-rate-limit')
const connectDB     = require('./config/db')
const errorHandler  = require('./middleware/errorHandler')


require('dotenv').config()
require('express-async-errors')

const app = express()
app.set('trust proxy', 1)
app.disable('x-powered-by')




const xss = require('xss-clean')
const hpp = require('hpp')
const morgan = require('morgan')



app.get('/healthz', (req, res) => {
  res.status(200).send('OK')
})

connectDB()

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
  process.env.CLIENT_URL,
  process.env.FRONTEND_URL,
  "https://www.themeetnet.com/"
].filter(Boolean)

const corsOptions = {
  origin: (origin, cb) => {
    // Allow no-origin (mobile apps, Postman, UptimeRobot)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS blocked: ${origin}`))
  },
  credentials: true,
  methods:        ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
}

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))   // handle preflight for ALL routes

// ── Sanitize MongoDB ──────────────────────────────
app.use(mongoSanitize())

// ── Rate limiting ─────────────────────────────────
// General: 100 requests per 15 min per IP
const generalLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  { message: 'Too many requests, slow down.' },
  standardHeaders: true,
  legacyHeaders:   false,
})

// Auth: 10 attempts per 15 min (prevents brute force)
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { message: 'Too many login attempts. Try in 15 minutes.' },
})

// ── Body parsers ──────────────────────────────────
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))
app.use(xss())
app.use(hpp())

// ── Routes ────────────────────────────────────────
app.use('/api/auth',          authLimit,    require('./routes/auth'))
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

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`)
  console.log(`✅ Mode: ${process.env.NODE_ENV}`)
  console.log(`✅ Allowed origins: ${allowedOrigins.join(', ')}`)
})