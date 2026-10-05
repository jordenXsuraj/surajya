// Email verification: codes, cooldowns, enforcement for new accounts only, change email, webhook.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
// Accounts created from now on must verify; older ones must never be blocked
const REQUIRED_FROM = new Date(Date.now() - 60e3)
process.env.VERIFICATION_REQUIRED_FROM = REQUIRED_FROM.toISOString()

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const EmailVerification = require('../models/EmailVerification')
const mailer = require('../services/email')
const { hashCode } = require('../services/verification')
const { signToken } = require('../utils/token')

let mongo, codes, ipN = 0
const PASSWORD = 'secret12345'
const nextIp = () => `198.51.100.${++ipN}`
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`).set('cf-connecting-ip', nextIp())
const withToken = (token, method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`)
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms
  for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await sleep(20) }
}
const lastCodeFor = email => [...codes].reverse().find(c => c.to === email)?.code

async function signup(email = `${crypto.randomBytes(4).toString('hex')}@college.edu`) {
  const res = await request(app).post('/api/auth/signup').set('cf-connecting-ip', nextIp()).send({
    name: 'New Student', email, password: PASSWORD, college: 'Test College', acceptTerms: true,
  })
  expect(res.status).toBe(201)
  await waitFor(() => lastCodeFor(email))
  return { res, user: await User.findById(res.body.user._id), token: res.body.token, email }
}
// Make the 60 s resend cooldown pass without waiting
const ageCodes = userId => EmailVerification.updateMany({ user: userId }, { $set: { createdAt: new Date(Date.now() - 61e3) } })

beforeAll(async () => {
  process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await User.init()
})
afterAll(async () => { await mongoose.disconnect(); await mongo.stop() })
beforeEach(() => {
  codes = []
  jest.spyOn(mailer, 'sendVerificationCode').mockImplementation(async args => { codes.push(args); return {} })
  jest.spyOn(mailer, 'sendEmailChangedNotice').mockResolvedValue({})
})
afterEach(() => jest.restoreAllMocks())

describe('signup', () => {
  test('responds as before plus emailVerified=false, and emails a 6-digit code', async () => {
    const { res, user, email } = await signup()
    expect(res.body.user).toMatchObject({ emailVerified: false, verificationRequired: true, email })
    expect(res.body).toHaveProperty('token')
    const code = lastCodeFor(email)
    expect(code).toMatch(/^\d{6}$/)
    expect(codes.at(-1).minutes).toBe(10)

    const docs = await EmailVerification.find({ user: user._id }).lean()
    expect(docs).toHaveLength(1)
    expect(JSON.stringify(docs)).not.toContain(code)                         // never stored in plain text
    expect(docs[0].codeHash).toBe(hashCode(user._id, code))
    expect(docs[0].codeHash).not.toBe(crypto.createHash('sha256').update(code).digest('hex'))   // keyed, not a bare hash
    expect(docs[0].expiresAt - Date.now()).toBeGreaterThan(9 * 60e3)
  })

  test('still succeeds when the email cannot be sent', async () => {
    mailer.sendVerificationCode.mockRejectedValue(new Error('Resend down'))
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app).post('/api/auth/signup').set('cf-connecting-ip', nextIp())
      .send({ name: 'No Mail', email: 'nomail@college.edu', password: PASSWORD, college: 'Test College', acceptTerms: true })
    expect(res.status).toBe(201)
    await waitFor(() => err.mock.calls.length)
    expect(String(err.mock.calls[0])).toMatch(/verification email failed/)
  })

  test('login and GET /me include emailVerified; public profiles never do', async () => {
    const { user, email } = await signup()
    const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD })
    expect(login.body.user.emailVerified).toBe(false)
    const me = await as(user, 'get', '/api/users/me')
    expect(me.body).toMatchObject({ emailVerified: false, emailBounced: false, verificationRequired: true })
    const other = await signup()
    const pub = await as(other.user, 'get', `/api/users/${user._id}`)
    for (const k of ['emailVerified', 'emailVerifiedAt', 'emailBounced', 'emailBouncedAt']) expect(pub.body).not.toHaveProperty(k)
  })
})

describe('POST /api/auth/verify-email', () => {
  test('correct code verifies and returns the updated user', async () => {
    const { user, email } = await signup()
    const res = await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ emailVerified: true, verificationRequired: false })
    const after = await User.findById(user._id).lean()
    expect(after.emailVerified).toBe(true)
    expect(after.emailVerifiedAt).toBeInstanceOf(Date)
    expect(await EmailVerification.countDocuments({ user: user._id })).toBe(0)
    // Repeating is harmless
    expect((await as(user, 'post', '/api/auth/verify-email').send({ code: '123456' })).status).toBe(200)
  })

  test('rejects malformed codes without using an attempt', async () => {
    const { user } = await signup()
    expect((await as(user, 'post', '/api/auth/verify-email').send({ code: '12ab' })).status).toBe(400)
    expect((await EmailVerification.findOne({ user: user._id })).attempts).toBe(0)
  })

  test('5 wrong attempts kill the code — even the right code fails afterwards', async () => {
    const { user, email } = await signup()
    const right = lastCodeFor(email)
    const wrong = right === '000000' ? '111111' : '000000'
    for (let i = 1; i <= 4; i++) {
      const r = await as(user, 'post', '/api/auth/verify-email').send({ code: wrong })
      expect(r.status).toBe(400)
      expect(r.body).toMatchObject({ code: 'INVALID_CODE', attemptsLeft: 5 - i })
    }
    expect((await as(user, 'post', '/api/auth/verify-email').send({ code: wrong })).body.code).toBe('CODE_LOCKED')
    const dead = await as(user, 'post', '/api/auth/verify-email').send({ code: right })
    expect(dead.status).toBe(400)
    expect(dead.body.code).toBe('CODE_LOCKED')
    expect((await User.findById(user._id).lean()).emailVerified).toBe(false)
  })

  test('expired codes are rejected', async () => {
    const { user, email } = await signup()
    await EmailVerification.updateMany({ user: user._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    const r = await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    expect(r.status).toBe(400)
    expect(r.body.code).toBe('CODE_EXPIRED')
  })
})

describe('POST /api/auth/send-verification', () => {
  test('60 s cooldown (including the code sent at signup), then a new code replaces the old one', async () => {
    const { user, email } = await signup()
    const first = lastCodeFor(email)
    const tooSoon = await as(user, 'post', '/api/auth/send-verification')
    expect(tooSoon.status).toBe(429)
    expect(tooSoon.body.code).toBe('RESEND_TOO_SOON')
    expect(tooSoon.headers['retry-after']).toBeDefined()

    await ageCodes(user._id)
    const ok = await as(user, 'post', '/api/auth/send-verification')
    expect(ok.status).toBe(200)
    expect(ok.body).toMatchObject({ expiresInSeconds: 600, resendAfterSeconds: 60 })
    const second = lastCodeFor(email)
    expect(await EmailVerification.countDocuments({ user: user._id })).toBe(1)

    // The minute limiter also holds even if the DB cooldown were bypassed
    await ageCodes(user._id)
    expect((await as(user, 'post', '/api/auth/send-verification')).status).toBe(429)

    if (first !== second) {
      expect((await as(user, 'post', '/api/auth/verify-email').send({ code: first })).status).toBe(400)   // older code invalid
    }
    expect((await as(user, 'post', '/api/auth/verify-email').send({ code: second })).status).toBe(200)
  })

  test('409 when already verified', async () => {
    const { user, email } = await signup()
    await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    const r = await as(await User.findById(user._id), 'post', '/api/auth/send-verification')
    expect(r.status).toBe(409)
    expect(r.body.code).toBe('ALREADY_VERIFIED')
  })
})

describe('enforcement', () => {
  const blockedCalls = (post, replyId, other) => [
    ['create post',    'post', '/api/posts', { type: 'social', text: 'hello from new user' }],
    ['reply',          'post', `/api/posts/${post._id}/replies`, { text: 'a reply' }],
    ['follow request', 'post', `/api/users/${other._id}/connect`, {}],
    ['interested',     'post', `/api/posts/${post._id}/interested`, {}],
    ['report post',    'post', `/api/posts/${post._id}/report`, { reason: 'spam' }],
    ['report reply',   'post', `/api/posts/${post._id}/replies/${replyId}/report`, { reason: 'spam' }],
    ['report user',    'post', `/api/users/${other._id}/report`, { reason: 'spam' }],
  ]
  let oldUser, post, replyId
  beforeAll(async () => {
    // Created before VERIFICATION_REQUIRED_FROM, never verified
    oldUser = await User.create({ name: 'Old Timer', email: 'old@college.edu', password: PASSWORD, college: 'Test College',
      createdAt: new Date(REQUIRED_FROM.getTime() - 86400e3) })
    post = await Post.create({ type: 'project', text: 'a project post', postedBy: oldUser._id, college: 'Test College',
      replies: [{ text: 'old reply', postedBy: oldUser._id }] })
    replyId = post.replies[0]._id
  })

  test('new unverified accounts get 403 EMAIL_NOT_VERIFIED on every protected action, but can browse', async () => {
    const { user } = await signup()
    for (const [name, method, url, body] of blockedCalls(post, replyId, oldUser)) {
      const r = await as(user, method, url).send(body)
      expect([name, r.status, r.body.code]).toEqual([name, 403, 'EMAIL_NOT_VERIFIED'])
      expect(r.body.message).toMatch(/verify your email/i)
    }
    expect((await as(user, 'get', '/api/posts')).status).toBe(200)
    expect((await as(user, 'get', `/api/posts/${post._id}`)).status).toBe(200)
    expect((await as(user, 'get', `/api/users/${oldUser._id}`)).status).toBe(200)
  })

  test('after verifying, the same actions work', async () => {
    const { user, email } = await signup()
    await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    const fresh = await User.findById(user._id)
    expect((await as(fresh, 'post', '/api/posts').send({ type: 'social', text: 'verified user post' })).status).toBe(201)
    expect((await as(fresh, 'post', `/api/users/${oldUser._id}/connect`)).status).toBe(200)
  })

  test('existing (older) accounts are never blocked, and only see a soft hint', async () => {
    expect((await as(oldUser, 'post', '/api/posts').send({ type: 'social', text: 'old account still posts' })).status).toBe(201)
    expect((await as(oldUser, 'post', `/api/posts/${post._id}/replies`).send({ text: 'old reply 2' })).status).toBe(201)
    const me = await as(oldUser, 'get', '/api/users/me')
    expect(me.body).toMatchObject({ emailVerified: false, verificationRequired: false })
  })

  test('an invalid VERIFICATION_REQUIRED_FROM never blocks anyone', async () => {
    const { user } = await signup()
    process.env.VERIFICATION_REQUIRED_FROM = 'not-a-date'
    try {
      expect((await as(user, 'post', '/api/posts').send({ type: 'social', text: 'lenient fallback' })).status).toBe(201)
    } finally {
      process.env.VERIFICATION_REQUIRED_FROM = REQUIRED_FROM.toISOString()
    }
  })
})

describe('PUT /api/users/me/email', () => {
  test('wrong password, invalid, same and duplicate addresses are refused', async () => {
    const { user, email } = await signup()
    const taken = await signup()
    const call = body => as(user, 'put', '/api/users/me/email').send(body)
    expect((await call({ newEmail: 'x@college.edu', password: 'wrong-pass' })).status).toBe(400)
    expect((await call({ newEmail: 'not-an-email', password: PASSWORD })).status).toBe(400)
    expect((await call({ newEmail: email.toUpperCase(), password: PASSWORD })).status).toBe(400)
    const dup = await call({ newEmail: ` ${taken.email.toUpperCase()} `, password: PASSWORD })
    expect(dup.status).toBe(409)
    expect(dup.body.code).toBe('EMAIL_TAKEN')
  })

  test('changes the email, needs verifying again, bumps tokenVersion, notifies both addresses', async () => {
    const { user, email, token } = await signup()
    await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    // A code sent to the OLD address must not verify the new one
    await EmailVerification.create({ user: user._id, email, codeHash: hashCode(user._id, '424242'), expiresAt: new Date(Date.now() + 6e5) })

    const res = await withToken(token, 'put', '/api/users/me/email').set('cf-connecting-ip', nextIp())
      .send({ newEmail: '  New.Address@College.EDU ', password: PASSWORD })
    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ email: 'new.address@college.edu', emailVerified: false })
    expect((await withToken(token, 'get', '/api/users/me')).status).toBe(401)          // old session ended
    expect((await withToken(res.body.token, 'get', '/api/users/me')).status).toBe(200)

    await waitFor(() => lastCodeFor('new.address@college.edu'))
    expect(mailer.sendEmailChangedNotice).toHaveBeenCalledWith(expect.objectContaining({ to: email }))
    expect(mailer.sendEmailChangedNotice.mock.calls[0][0].newEmailMasked).toMatch(/^n\*+@college\.edu$/)

    const after = await User.findById(user._id).lean()
    expect(after.tokenVersion).toBe(1)
    expect(after.emailVerified).toBe(false)
    expect(after.emailVerifiedAt).toBeNull()

    const verify = await withToken(res.body.token, 'post', '/api/auth/verify-email').send({ code: lastCodeFor('new.address@college.edu') })
    expect(verify.status).toBe(200)
    expect((await request(app).post('/api/auth/login').send({ email: 'new.address@college.edu', password: PASSWORD })).status).toBe(200)
  })
})

describe('POST /api/webhooks/resend', () => {
  const SECRET = 'whsec_' + Buffer.from('test-webhook-signing-key-32bytes!!').toString('base64')
  function signed(body, { secret = SECRET, ts = Math.floor(Date.now() / 1000) } = {}) {
    const raw = JSON.stringify(body), id = 'msg_' + crypto.randomBytes(6).toString('hex')
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const sig = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64')
    return request(app).post('/api/webhooks/resend').set('Content-Type', 'application/json')
      .set('svix-id', id).set('svix-timestamp', String(ts)).set('svix-signature', `v1,${sig}`).send(raw)
  }
  afterEach(() => { delete process.env.RESEND_WEBHOOK_SECRET })

  test('404 when RESEND_WEBHOOK_SECRET is not set', async () => {
    expect((await signed({ type: 'email.bounced', data: { to: ['a@b.co'] } })).status).toBe(404)
  })

  test('rejects missing, wrong, and stale signatures', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET
    expect((await request(app).post('/api/webhooks/resend').send({ type: 'email.bounced' })).status).toBe(401)
    const other = 'whsec_' + Buffer.from('a-completely-different-signing-key').toString('base64')
    expect((await signed({ type: 'email.bounced', data: { to: ['a@b.co'] } }, { secret: other })).status).toBe(401)
    expect((await signed({ type: 'email.bounced', data: { to: ['a@b.co'] } }, { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401)
  })

  test('a valid bounce marks the user, /me shows it, verifying clears it', async () => {
    process.env.RESEND_WEBHOOK_SECRET = SECRET
    const { user, email } = await signup()
    const res = await signed({ type: 'email.bounced', data: { to: [email.toUpperCase()] } })
    expect(res.status).toBe(200)
    expect((await User.findById(user._id).lean()).emailBounced).toBe(true)
    expect((await as(user, 'get', '/api/users/me')).body.emailBounced).toBe(true)
    await as(user, 'post', '/api/auth/verify-email').send({ code: lastCodeFor(email) })
    expect((await User.findById(user._id).lean()).emailBounced).toBe(false)
  })
})
