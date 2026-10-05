// MongoDB operator injection: request bodies and query strings are sanitized and
// such requests refused; ordinary data (dots inside VALUES) keeps working.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const mailer = require('../services/email')
const { signToken } = require('../utils/token')

let mongo, victim
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`)

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await User.init()
  victim = await User.create({ name: 'Victim', email: 'victim@college.edu', password: 'secret12345', college: 'Test College' })
})
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(() => jest.spyOn(mailer, 'sendVerificationCode').mockResolvedValue({}))
afterEach(() => jest.restoreAllMocks())

const REFUSED = { message: 'Invalid request: field names may not start with "$" or contain "."' }

describe('login', () => {
  test('{"email":{"$gt":""}} is refused, never matches a user', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: 'x' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual(REFUSED)
    expect(res.body).not.toHaveProperty('token')
  })

  test('operator in the password field is refused', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'victim@college.edu', password: { $ne: null } })
    expect(res.status).toBe(400)
    expect(res.body).not.toHaveProperty('token')
  })

  test('non-string fields without operators get a 400, not a 500', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: {}, password: 'x' })).status).toBe(400)
    expect((await request(app).post('/api/auth/login').send({ email: ['victim@college.edu'], password: 'secret12345' })).status).toBe(400)
    expect((await request(app).post('/api/auth/signup').send({ name: { first: 'A' }, email: 'n@college.edu', password: 'secret12345', college: 'C', acceptTerms: true })).status).toBe(400)
  })
})

describe('other bodies and query strings', () => {
  test('a $-key in another JSON body is refused and nothing is written', async () => {
    const res = await as(victim, 'post', '/api/posts').send({ type: 'social', text: 'injected post text', $where: 'sleep(1000)' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual(REFUSED)
    expect(await Post.countDocuments({ postedBy: victim._id })).toBe(0)

    const nested = await as(victim, 'put', '/api/users/me').send({ bio: { $set: 'pwned' } })
    expect(nested.status).toBe(400)
    expect((await User.findById(victim._id).lean()).bio).toBe('')
  })

  test('$-keys deep inside arrays and dotted keys are refused too', async () => {
    expect((await as(victim, 'put', '/api/users/me').send({ projects: [{ name: 'P', link: 'x', $gt: '' }] })).status).toBe(400)
    expect((await as(victim, 'post', '/api/posts').send({ type: 'social', text: 'dotted key post', 'typeEngagement.qa': 99 })).status).toBe(400)
  })

  test('operators in the query string are refused', async () => {
    const res = await as(victim, 'get', '/api/users?search[$ne]=x')
    expect(res.status).toBe(400)
    expect(res.body).toEqual(REFUSED)
  })
})

describe('legitimate requests are unaffected', () => {
  test('dots inside values (emails, URLs, file names) keep working', async () => {
    const email = `first.last.${crypto.randomBytes(3).toString('hex')}@college.edu.in`
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Dot Person', email, password: 'secret12345', college: 'St. Xavier’s College', acceptTerms: true,
      projects: [{ name: 'site.v2', link: 'https://example.com/a.b?x=1.2' }],
    })
    expect(signup.status).toBe(201)
    expect(signup.body.user.projects).toEqual([{ name: 'site.v2', link: 'https://example.com/a.b?x=1.2' }])

    const u = await User.findOne({ email })
    const put = await as(u, 'put', '/api/users/me').send({ bio: 'Loves Node.js & v1.2.3', mediaItems: [{ type: 'youtube', url: 'https://www.youtube.com/watch?v=a.b' }] })
    expect(put.status).toBe(200)
    expect(put.body.bio).toBe('Loves Node.js & v1.2.3')
    expect((await as(u, 'post', '/api/posts').send({ type: 'study', text: 'notes.pdf for ch. 3.1', link: 'docs.google.com/x.y' })).status).toBe(201)
    expect((await as(u, 'get', '/api/users?search=dot.person&skill=Node.js')).status).toBe(200)
  })

  test('webhook payloads with dotted keys are sanitized but still accepted', async () => {
    const secret = 'whsec_' + Buffer.from('another-test-signing-key-32bytes').toString('base64')
    process.env.RESEND_WEBHOOK_SECRET = secret
    try {
      const raw = JSON.stringify({ type: 'email.delivered', data: { to: ['x@y.co'], tags: { 'campaign.id': 'a' } } })
      const id = 'msg_1', ts = String(Math.floor(Date.now() / 1000))
      const sig = crypto.createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64')
      const res = await request(app).post('/api/webhooks/resend').set('Content-Type', 'application/json')
        .set('svix-id', id).set('svix-timestamp', ts).set('svix-signature', `v1,${sig}`).send(raw)
      expect(res.status).toBe(200)
    } finally {
      delete process.env.RESEND_WEBHOOK_SECRET
    }
  })
})
