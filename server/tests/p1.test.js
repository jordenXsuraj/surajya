// Phase 1 backend: sessions, passwords, blocking, push, reports, deletion, config.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // these suites predate email verification
process.env.ADMIN_EMAIL      = 'admin@college.edu'
process.env.ADMIN_SECRET_KEY = 'test-admin-key'

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const jwt      = require('jsonwebtoken')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app           = require('../index')
const User          = require('../models/User')
const Post          = require('../models/Post')
const Notification  = require('../models/Notification')
const Report        = require('../models/Report')
const PasswordReset = require('../models/PasswordReset')
const mailer        = require('../services/email')
const notifySvc     = require('../services/notify')
const { clientIp }  = require('../utils/clientIp')
const { signToken } = require('../utils/token')
const { cloudinary } = require('../config/cloudinary')

let mongo
const PASSWORD = 'secret123'
const PUSH = n => `ExponentPushToken[${String(n).padEnd(22, 'x')}]`

function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({
    name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`,
    password: PASSWORD, college: 'Test College', year: '2nd', branch: 'CS', ...overrides,
  })
}
const tokenOf = user => signToken(user)
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${tokenOf(user)}`)
const withToken = (token, method, url) => request(app)[method](url).set('Authorization', `Bearer ${token}`)
const fresh = id => User.findById(id).select('+pushTokens +password').lean()

async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) return v
    await new Promise(r => setTimeout(r, 25))
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

// Fake Expo client: records messages; tokens containing "dead" are unregistered
const sentPushes = []
const fakeExpo = {
  chunkPushNotifications: msgs => [msgs],
  sendPushNotificationsAsync: async chunk => {
    sentPushes.push(...chunk)
    return chunk.map(m => (m.to.includes('dead')
      ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } }
      : { status: 'ok', id: `ticket-${m.to}` }))
  },
  chunkPushNotificationReceiptIds: ids => [ids],
  getPushNotificationReceiptsAsync: async ids => Object.fromEntries(ids.map(id =>
    [id, id.includes('late') ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok' }])),
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([User.init(), Report.init(), PasswordReset.init()])   // build unique indexes
  notifySvc._setExpoClient(fakeExpo)
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
afterEach(() => {
  delete process.env.CLIENT_IP_HEADER
  delete process.env.CLIENT_IP_XFF_INDEX
  delete process.env.DEBUG_IP_ROUTE
  jest.restoreAllMocks()
})

// ───────────────────────────────── A1 client IP
describe('clientIp()', () => {
  const req = headers => ({ ip: '10.0.0.5', headers })

  test('without CLIENT_IP_HEADER it is req.ip, and spoofed headers are ignored', () => {
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4', 'cf-connecting-ip': '5.6.7.8' }))).toBe('10.0.0.5')
  })

  test('single-value header: valid IPv4/IPv6 used; client-sent X-Forwarded-For ignored', () => {
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP'          // case-insensitive
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' }))).toBe('203.0.113.7')
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1')
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7:4431' }))).toBe('203.0.113.7')
    expect(clientIp(req({ 'cf-connecting-ip': '[2001:db8::2]:443' }))).toBe('2001:db8::2')
  })

  test.each([['not-an-ip'], ['1.2.3.4, 5.6.7.8'], [''], ['999.1.1.1'], ['<script>']])(
    'invalid value %p falls back to req.ip', bad => {
      process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
      expect(clientIp(req({ 'cf-connecting-ip': bad }))).toBe('10.0.0.5')
    })

  test('missing header falls back to req.ip', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    expect(clientIp(req({}))).toBe('10.0.0.5')
  })

  test('x-forwarded-for picks the configured hop; entries a client prepends cannot win', () => {
    process.env.CLIENT_IP_HEADER = 'x-forwarded-for'
    const spoofed = { 'x-forwarded-for': '6.6.6.6, 198.51.100.4, 10.1.1.1' }   // client sent 6.6.6.6
    expect(clientIp(req(spoofed))).toBe('10.1.1.1')                         // default index -1
    process.env.CLIENT_IP_XFF_INDEX = '-2'
    expect(clientIp(req(spoofed))).toBe('198.51.100.4')
    expect(clientIp(req({ 'x-forwarded-for': '198.51.100.4, 10.1.1.1' }))).toBe('198.51.100.4')  // same without spoof
    process.env.CLIENT_IP_XFF_INDEX = '-9'
    expect(clientIp(req(spoofed))).toBe('10.0.0.5')                          // out of range
    process.env.CLIENT_IP_XFF_INDEX = 'abc'
    expect(clientIp(req(spoofed))).toBe('10.0.0.5')
  })

  test('limiters use it: separate real IPs get separate signup buckets', async () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    const a = await request(app).post('/api/auth/signup').set('cf-connecting-ip', '198.51.100.21').send({})
    const b = await request(app).post('/api/auth/signup').set('cf-connecting-ip', '198.51.100.22').send({})
    expect(a.headers.ratelimit).toMatch(/remaining=29/)
    expect(b.headers.ratelimit).toMatch(/remaining=29/)
  })
})

describe('GET /api/_debug/ip', () => {
  let admin, other
  beforeAll(async () => {
    admin = await makeUser({ email: 'admin@college.edu' })
    other = await makeUser()
  })

  test('does not exist unless DEBUG_IP_ROUTE=1', async () => {
    const res = await as(admin, 'get', '/api/_debug/ip').set('x-admin-key', 'test-admin-key')
    expect(res.status).toBe(404)
  })

  test('needs the admin key AND the admin JWT', async () => {
    process.env.DEBUG_IP_ROUTE = '1'
    expect((await as(admin, 'get', '/api/_debug/ip')).status).toBe(404)
    expect((await as(admin, 'get', '/api/_debug/ip').set('x-admin-key', 'wrong')).status).toBe(404)
    expect((await as(other, 'get', '/api/_debug/ip').set('x-admin-key', 'test-admin-key')).status).toBe(404)
  })

  test('returns only the caller\'s own headers', async () => {
    process.env.DEBUG_IP_ROUTE = '1'
    const res = await as(admin, 'get', '/api/_debug/ip')
      .set('x-admin-key', 'test-admin-key').set('cf-connecting-ip', '203.0.113.9')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toMatchObject({ headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': null } })
    expect(res.body).toHaveProperty('reqIp')
    expect(res.body).toHaveProperty('reqIps')
  })
})

// ───────────────────────────────── A2 CORS
describe('CORS', () => {
  test('disallowed origin gets 403 JSON without a stack trace', async () => {
    const res = await request(app).get('/api/app/config').set('Origin', 'https://evil.example')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ message: 'Origin not allowed' })
    expect(res.text).not.toMatch(/at .*\.js/)
  })
  test('preflight from a disallowed origin is 403 too', async () => {
    const res = await request(app).options('/api/posts').set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')
    expect(res.status).toBe(403)
  })
  test('allowed origins and no-origin (mobile) still work', async () => {
    const ok = await request(app).get('/api/app/config').set('Origin', 'https://themeetnet.com')
    expect(ok.status).toBe(200)
    expect(ok.headers['access-control-allow-origin']).toBe('https://themeetnet.com')
    expect((await request(app).get('/api/app/config')).status).toBe(200)
  })
})

// ───────────────────────────────── A3 tokenVersion
describe('tokenVersion / logout-all', () => {
  test('legacy token without tv works while tokenVersion is 0, and dies after logout-all', async () => {
    const u = await makeUser()
    const legacy = jwt.sign({ id: u._id }, process.env.JWT_SECRET, { expiresIn: '30d' })
    expect((await withToken(legacy, 'get', '/api/users/me')).status).toBe(200)

    await User.updateOne({ _id: u._id }, { $set: { pushTokens: [{ token: PUSH('lo'), platform: 'android', deviceId: 'd1' }] } })
    const out = await withToken(legacy, 'post', '/api/auth/logout-all')
    expect(out.status).toBe(200)
    expect(jwt.decode(out.body.token).tv).toBe(1)

    expect((await withToken(legacy, 'get', '/api/users/me')).status).toBe(401)
    expect((await withToken(out.body.token, 'get', '/api/users/me')).status).toBe(200)
    expect((await fresh(u._id)).pushTokens).toEqual([])
  })

  test('a token with an old tv is rejected', async () => {
    const u = await makeUser()
    const t0 = signToken(u)
    await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } })
    const res = await withToken(t0, 'get', '/api/users/me')
    expect(res.status).toBe(401)
    expect(res.body.message).toMatch(/expired/i)
  })

  test('login and signup tokens carry tv', async () => {
    const u = await makeUser()
    const res = await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })
    expect(jwt.decode(res.body.token)).toMatchObject({ id: String(u._id), tv: 0 })
  })
})

// ───────────────────────────────── A4 change password
describe('POST /api/auth/change-password', () => {
  test('validates, never answers 401 for a wrong password', async () => {
    const u = await makeUser()
    const call = body => as(u, 'post', '/api/auth/change-password').send(body)
    expect((await call({ currentPassword: 'wrong-one', newPassword: 'longenough1' })).status).toBe(400)
    expect((await call({ currentPassword: PASSWORD, newPassword: 'short' })).body.message).toMatch(/8 characters/)
    expect((await call({ currentPassword: PASSWORD, newPassword: PASSWORD + '' })).status).toBe(400)
  })

  test('changes the password, rotates tokenVersion, clears push tokens', async () => {
    const u = await makeUser()
    const oldToken = tokenOf(u)
    await User.updateOne({ _id: u._id }, { $set: { pushTokens: [{ token: PUSH('cp'), platform: 'ios', deviceId: 'd' }] } })

    const res = await withToken(oldToken, 'post', '/api/auth/change-password')
      .send({ currentPassword: PASSWORD, newPassword: 'brand-new-pass' })
    expect(res.status).toBe(200)
    expect((await withToken(oldToken, 'get', '/api/users/me')).status).toBe(401)
    expect((await withToken(res.body.token, 'get', '/api/users/me')).status).toBe(200)

    const after = await fresh(u._id)
    expect(after.password).toMatch(/^\$2[aby]\$12\$/)
    expect(after.tokenVersion).toBe(1)
    expect(after.pushTokens).toEqual([])
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'brand-new-pass' })).status).toBe(200)
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: PASSWORD })).status).toBe(400)
  })

  test('limited to 5 attempts per 15 minutes per user', async () => {
    const u = await makeUser()
    const t = tokenOf(u)
    for (let i = 0; i < 5; i++) {
      expect((await withToken(t, 'post', '/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'whatever123' })).status).toBe(400)
    }
    expect((await withToken(t, 'post', '/api/auth/change-password').send({ currentPassword: 'nope', newPassword: 'whatever123' })).status).toBe(429)
  })
})

// ───────────────────────────────── A5 forgot / reset
describe('forgot / reset password', () => {
  let ipN = 0
  const nextIp = () => `198.51.100.${100 + (++ipN)}`
  const forgot = (email, ip = nextIp()) => request(app).post('/api/auth/forgot-password')
    .set('cf-connecting-ip', ip).send({ email })
  const reset = (token, newPassword, ip = nextIp()) => request(app).post('/api/auth/reset-password')
    .set('cf-connecting-ip', ip).send({ token, newPassword })
  beforeEach(() => { process.env.CLIENT_IP_HEADER = 'cf-connecting-ip' })

  async function requestLink(user) {
    const spy = jest.spyOn(mailer, 'sendPasswordReset').mockResolvedValue({})
    const res = await forgot(user.email)
    await waitFor(() => spy.mock.calls.length)
    const { link } = spy.mock.calls[0][0]
    return { res, token: new URL(link).searchParams.get('token'), link }
  }

  test('same answer for known and unknown emails; nothing sent for unknown', async () => {
    const u = await makeUser()
    const spy = jest.spyOn(mailer, 'sendPasswordReset').mockResolvedValue({})
    const unknown = await forgot('nobody-here@college.edu')
    const known   = await forgot(u.email)
    expect(unknown.status).toBe(200)
    expect(known.status).toBe(200)
    expect(unknown.body).toEqual(known.body)
    await waitFor(() => spy.mock.calls.length)
    await sleep(100)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0].to).toBe(u.email)
  })

  test('stores only a SHA-256 hash; link points at /reset-password', async () => {
    const u = await makeUser()
    const { token, link } = await requestLink(u)
    expect(link).toMatch(/^https:\/\/themeetnet\.com\/reset-password\?token=/)
    const docs = await PasswordReset.find({ user: u._id }).lean()
    expect(docs).toHaveLength(1)
    expect(docs[0].tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(docs)).not.toContain(token)
    expect(docs[0].expiresAt - Date.now()).toBeGreaterThan(29 * 60e3)
  })

  test('token works once, bumps tokenVersion, sets the password', async () => {
    const u = await makeUser()
    const oldToken = tokenOf(u)
    const { token } = await requestLink(u)
    expect((await reset(token, 'short')).status).toBe(400)
    const ok = await reset(token, 'resetted-pass-1')
    expect(ok.status).toBe(200)
    expect((await reset(token, 'resetted-pass-2')).status).toBe(400)          // single use
    expect((await withToken(oldToken, 'get', '/api/users/me')).status).toBe(401)
    expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'resetted-pass-1' })).status).toBe(200)
  })

  test('expired and superseded tokens are rejected', async () => {
    const u = await makeUser()
    const first = await requestLink(u)
    jest.restoreAllMocks()
    const second = await requestLink(u)
    expect((await reset(first.token, 'newpassword1')).status).toBe(400)       // older link invalidated
    await PasswordReset.updateMany({ user: u._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await reset(second.token, 'newpassword1')).status).toBe(400)      // expired
  })

  test('3 requests per hour per email', async () => {
    jest.spyOn(mailer, 'sendPasswordReset').mockResolvedValue({})
    const u = await makeUser()
    for (let i = 0; i < 3; i++) expect((await forgot(u.email)).status).toBe(200)
    expect((await forgot(u.email)).status).toBe(429)
    expect((await forgot(u.email.toUpperCase())).status).toBe(429)            // normalized
  })

  test('10 requests per hour per client IP', async () => {
    jest.spyOn(mailer, 'sendPasswordReset').mockResolvedValue({})
    for (let i = 0; i < 10; i++) expect((await forgot(`ipcheck${i}@college.edu`, '198.51.100.250')).status).toBe(200)
    expect((await forgot('ipcheck-last@college.edu', '198.51.100.250')).status).toBe(429)
  })
})

// ───────────────────────────────── B1 push tokens
describe('push tokens', () => {
  test('validated, upserted by deviceId, moved between accounts, never exposed', async () => {
    const a = await makeUser(), b = await makeUser()
    const add = (u, body) => as(u, 'post', '/api/users/me/push-token').send(body)

    expect((await add(a, { token: 'nope', platform: 'android', deviceId: 'x' })).status).toBe(400)
    expect((await add(a, { token: PUSH('a1'), platform: 'web', deviceId: 'x' })).status).toBe(400)
    expect((await add(a, { token: PUSH('a1'), platform: 'android' })).status).toBe(400)

    expect((await add(a, { token: PUSH('a1'), platform: 'android', deviceId: 'phone' })).status).toBe(200)
    expect((await add(a, { token: PUSH('a2'), platform: 'android', deviceId: 'phone' })).status).toBe(200)
    expect((await fresh(a._id)).pushTokens.map(t => t.token)).toEqual([PUSH('a2')])

    // Same phone logs into another account: the token leaves the first account
    await add(b, { token: PUSH('a2'), platform: 'android', deviceId: 'phone-b' })
    expect((await fresh(a._id)).pushTokens).toEqual([])

    for (let i = 0; i < 12; i++) await add(a, { token: PUSH(`m${i}`), platform: 'ios', deviceId: `dev${i}` })
    expect((await fresh(a._id)).pushTokens).toHaveLength(10)

    const me = await as(a, 'get', '/api/users/me')
    const pub = await as(b, 'get', `/api/users/${a._id}`)
    for (const body of [me.body, pub.body]) {
      expect(body).not.toHaveProperty('pushTokens')
      expect(body).not.toHaveProperty('tokenVersion')
    }
    expect(pub.body).not.toHaveProperty('blockedUsers')

    expect((await as(a, 'delete', '/api/users/me/push-token').send({ deviceId: 'dev11' })).status).toBe(200)
    expect((await fresh(a._id)).pushTokens.map(t => t.deviceId)).not.toContain('dev11')
  })
})

// ───────────────────────────────── B2 notify()
describe('notify()', () => {
  beforeEach(() => { sentPushes.length = 0 })

  test('creates the notification and pushes with the expected payload', async () => {
    const to = await makeUser(), from = await makeUser()
    await User.updateOne({ _id: to._id }, { $set: { pushTokens: [{ token: PUSH('ok1'), platform: 'android', deviceId: 'd' }] } })
    const post = await Post.create({ type: 'social', text: 'a named post', postedBy: to._id, college: 'Test College' })

    const n = await notifySvc.notify({ recipient: to._id, sender: from._id, type: 'post_liked', post: post._id, message: 'X liked your post' })
    expect(n).not.toBeNull()
    expect(sentPushes).toHaveLength(1)
    expect(sentPushes[0]).toMatchObject({
      to: PUSH('ok1'), title: 'MeetNet', body: 'X liked your post',
      data: { type: 'post_liked', postId: String(post._id), senderId: String(from._id), url: `/post/${post._id}` },
    })

    await notifySvc.notify({ recipient: to._id, sender: from._id, type: 'connection_request', message: 'wants to follow' })
    expect(sentPushes[1].data.url).toBe(`/profile/${from._id}`)
  })

  test('skips self, blocks in either direction, and anonymous authors as sender', async () => {
    const a = await makeUser(), b = await makeUser()
    expect(await notifySvc.notify({ recipient: a._id, sender: a._id, type: 'post_liked', message: 'm' })).toBeNull()

    await User.updateOne({ _id: a._id }, { $set: { blockedUsers: [b._id] } })
    expect(await notifySvc.notify({ recipient: a._id, sender: b._id, type: 'connection_request', message: 'm' })).toBeNull()
    expect(await notifySvc.notify({ recipient: b._id, sender: a._id, type: 'connection_request', message: 'm' })).toBeNull()

    const c = await makeUser(), author = await makeUser()
    const anon = await Post.create({ type: 'confession', text: 'anon text here', isAnonymous: true, postedBy: author._id, college: 'Test College' })
    expect(await notifySvc.notify({ recipient: c._id, sender: author._id, type: 'post_replied', post: anon._id, message: 'm' })).toBeNull()
    // The author may still RECEIVE notifications about it (sender is someone else)
    expect(await notifySvc.notify({ recipient: author._id, sender: c._id, type: 'post_replied', post: anon._id, message: 'm' })).not.toBeNull()
    expect(await Notification.countDocuments({ post: anon._id, sender: author._id })).toBe(0)
  })

  test('new_post is in-app only; DeviceNotRegistered tokens are removed', async () => {
    const to = await makeUser(), from = await makeUser()
    await User.updateOne({ _id: to._id }, { $set: { pushTokens: [
      { token: PUSH('dead1'), platform: 'android', deviceId: 'd1' },
      { token: PUSH('live1'), platform: 'android', deviceId: 'd2' },
    ] } })
    await notifySvc.notify({ recipient: to._id, sender: from._id, type: 'new_post', message: 'new post' })
    expect(sentPushes).toHaveLength(0)

    await notifySvc.notify({ recipient: to._id, sender: from._id, type: 'connection_accepted', message: 'accepted' })
    expect(sentPushes).toHaveLength(2)
    expect((await fresh(to._id)).pushTokens.map(t => t.token)).toEqual([PUSH('live1')])

    // Late receipt says the device is gone too
    await notifySvc.checkReceipts({ 'ticket-late': PUSH('live1') })
    expect((await fresh(to._id)).pushTokens).toEqual([])
  })

  test('routes use it: reply notifies the author, author self-reply on anonymous post does not', async () => {
    const author = await makeUser(), replier = await makeUser()
    const anon = await Post.create({ type: 'confession', text: 'anon text here', isAnonymous: true, postedBy: author._id, college: 'Test College' })
    await as(replier, 'post', `/api/posts/${anon._id}/replies`).send({ text: 'hello there' })
    await as(author, 'post', `/api/posts/${anon._id}/replies`).send({ text: 'author reply' })
    const n = await waitFor(() => Notification.findOne({ post: anon._id, type: 'post_replied' }).lean())
    expect(n).toMatchObject({ recipient: author._id, sender: replier._id })
    await sleep(100)
    expect(await Notification.countDocuments({ post: anon._id })).toBe(1)
  })

  test('new_post fan-out skips followers blocked either way', async () => {
    const poster = await makeUser(), f1 = await makeUser(), f2 = await makeUser()
    await User.updateOne({ _id: poster._id }, { $set: { followers: [f1._id, f2._id] } })
    await User.updateOne({ _id: f2._id }, { $set: { blockedUsers: [poster._id] } })
    const res = await as(poster, 'post', '/api/posts').send({ type: 'social', text: 'fan out test post' })
    await waitFor(() => Notification.countDocuments({ post: res.body._id }))
    await sleep(100)
    const recips = (await Notification.find({ post: res.body._id }).lean()).map(n => String(n.recipient))
    expect(recips).toEqual([String(f1._id)])
  })
})

// ───────────────────────────────── B3 blocking
describe('blocking', () => {
  let a, b, aPost, bPost, bAnon, aPostWithReply
  beforeAll(async () => {
    a = await makeUser({ college: 'Block College' })
    b = await makeUser({ college: 'Block College' })
    await User.updateOne({ _id: a._id }, { $set: { following: [b._id], followers: [b._id] } })
    await User.updateOne({ _id: b._id }, { $set: { following: [a._id], followers: [a._id], pendingRequests: [] } })
    aPost = await Post.create({ type: 'social', text: 'post by A here', postedBy: a._id, college: 'Block College' })
    bPost = await Post.create({ type: 'social', text: 'post by B here', postedBy: b._id, college: 'Block College' })
    bAnon = await Post.create({ type: 'confession', text: 'anon by B here', isAnonymous: true, postedBy: b._id, college: 'Block College' })
    aPostWithReply = await Post.create({ type: 'social', text: 'A post B replied', postedBy: a._id, college: 'Block College',
      replies: [{ text: 'reply from B', postedBy: b._id }, { text: 'reply from A', postedBy: a._id }] })
    await Notification.create({ recipient: a._id, sender: b._id, type: 'post_liked', message: 'B liked' })

    const res = await as(a, 'post', `/api/users/${b._id}/block`)
    expect(res.status).toBe(200)
  })

  test('block removes follow relations both ways', async () => {
    const [ua, ub] = await Promise.all([fresh(a._id), fresh(b._id)])
    expect(ua.blockedUsers.map(String)).toEqual([String(b._id)])
    for (const u of [ua, ub]) {
      expect(u.following).toEqual([])
      expect(u.followers).toEqual([])
    }
  })

  test.each([['A', () => a], ['B', () => b]])('%s cannot see the other\'s named posts in any feed', async (_, who) => {
    const viewer = who()
    const other = viewer === a ? bPost : aPost
    for (const url of ['/api/posts', '/api/posts?global=true']) {
      const ids = (await as(viewer, 'get', url)).body.map(p => p._id)
      expect(ids).not.toContain(String(other._id))
    }
  })

  test('anonymous posts: the blocker still sees them (no de-anonymising oracle)…', async () => {
    const ids = (await as(a, 'get', '/api/posts')).body.map(p => p._id)
    expect(ids).toContain(String(bAnon._id))
  })

  test('…but the blocked user does not see the blocker\'s anonymous posts', async () => {
    const aAnon = await Post.create({ type: 'confession', text: 'anon by A here', isAnonymous: true, postedBy: a._id, college: 'Block College' })
    const ids = (await as(b, 'get', '/api/posts')).body.map(p => p._id)
    expect(ids).not.toContain(String(aAnon._id))
    expect((await as(b, 'get', `/api/posts/${aAnon._id}`)).status).toBe(404)
  })

  test('replies from blocked users are removed inside posts', async () => {
    const post = (await as(a, 'get', '/api/posts')).body.find(p => p._id === String(aPostWithReply._id))
    expect(post.replies.map(r => r.text)).toEqual(['reply from A'])
  })

  test('single post: 404 with a token when the author is blocked, 200 publicly', async () => {
    expect((await as(a, 'get', `/api/posts/${bPost._id}`)).status).toBe(404)
    expect((await as(b, 'get', `/api/posts/${aPost._id}`)).status).toBe(404)
    expect((await request(app).get(`/api/posts/${bPost._id}`)).status).toBe(200)
  })

  test('profile, search and suggestions hide blocked users both ways', async () => {
    expect((await as(a, 'get', `/api/users/${b._id}`)).status).toBe(404)
    expect((await as(b, 'get', `/api/users/${a._id}`)).status).toBe(404)
    expect((await as(b, 'get', `/api/users/${a._id}/posts`)).status).toBe(404)
    for (const url of ['/api/users', '/api/users/all', '/api/users/suggestions', `/api/users?search=${encodeURIComponent(b.name)}`]) {
      const ids = (await as(a, 'get', url)).body.map(u => u._id)
      expect(ids).not.toContain(String(b._id))
    }
  })

  test('follow requests are refused (403) both ways', async () => {
    expect((await as(a, 'post', `/api/users/${b._id}/connect`)).status).toBe(403)
    expect((await as(b, 'post', `/api/users/${a._id}/connect`)).status).toBe(403)
  })

  test('notifications from blocked users are hidden', async () => {
    const list = (await as(a, 'get', '/api/notifications')).body
    expect(list.some(n => String(n.sender?._id) === String(b._id))).toBe(false)
    expect((await as(a, 'get', '/api/notifications/unread-count')).body.count).toBe(0)
  })

  test('blocked list, then unblock restores visibility', async () => {
    const list = (await as(a, 'get', '/api/users/me/blocked')).body
    expect(list).toHaveLength(1)
    expect(Object.keys(list[0]).sort()).toEqual(['_id', 'avatar', 'name', 'username'])

    await as(a, 'post', `/api/users/${b._id}/unblock`)
    expect((await as(a, 'get', `/api/users/${b._id}`)).status).toBe(200)
    expect((await as(a, 'get', '/api/posts')).body.map(p => p._id)).toContain(String(bPost._id))
    await as(a, 'post', `/api/users/${b._id}/block`)    // restore for later tests
  })

  test('cannot block yourself', async () => {
    expect((await as(a, 'post', `/api/users/${a._id}/block`)).status).toBe(400)
  })
})

// ───────────────────────────────── B4 reports
describe('reports', () => {
  test('user + reply reports, duplicates refused, admin sees every type', async () => {
    const reporter = await makeUser(), bad = await makeUser()
    const admin = await User.findOne({ email: 'admin@college.edu' }) || await makeUser({ email: 'admin@college.edu' })
    const post = await Post.create({ type: 'social', text: 'post with bad reply', postedBy: reporter._id, college: 'Test College',
      replies: [{ text: 'abusive reply', postedBy: bad._id }] })
    const replyId = post.replies[0]._id

    expect((await as(reporter, 'post', `/api/users/${bad._id}/report`).send({ reason: 'nope' })).status).toBe(400)
    expect((await as(reporter, 'post', `/api/users/${bad._id}/report`).send({ reason: 'harassment', note: 'mean' })).status).toBe(200)
    expect((await as(reporter, 'post', `/api/users/${bad._id}/report`).send({ reason: 'spam' })).status).toBe(400)
    expect((await as(reporter, 'post', `/api/users/${reporter._id}/report`).send({ reason: 'spam' })).status).toBe(400)

    expect((await as(reporter, 'post', `/api/posts/${post._id}/replies/${replyId}/report`).send({ reason: 'hate' })).status).toBe(200)
    expect((await as(reporter, 'post', `/api/posts/${post._id}/replies/${replyId}/report`).send({ reason: 'hate' })).status).toBe(400)
    expect((await as(bad, 'post', `/api/posts/${post._id}/replies/${replyId}/report`).send({ reason: 'hate' })).status).toBe(400)
    // A post report by the same reporter is a different target
    expect((await as(reporter, 'post', `/api/posts/${post._id}/report`).send({ reason: 'spam' })).status).toBe(200)

    const res = await as(admin, 'get', '/api/posts/admin/reports').set('x-admin-key', 'test-admin-key')
    expect(res.status).toBe(200)
    const mine = res.body.filter(r => String(r.reportedBy?._id) === String(reporter._id))
    expect(mine.map(r => r.targetType).sort()).toEqual(['post', 'reply', 'user'])
    expect(mine.find(r => r.targetType === 'user').user.name).toBe(bad.name)
    expect(mine.find(r => r.targetType === 'reply').reply.text).toBe('abusive reply')
  })
})

// ───────────────────────────────── B5 account deletion
describe('DELETE /api/users/me', () => {
  test('wrong password is 400 and changes nothing', async () => {
    const u = await makeUser()
    const res = await as(u, 'delete', '/api/users/me').send({ password: 'wrong-password' })
    expect(res.status).toBe(400)
    expect(await User.exists({ _id: u._id })).toBeTruthy()
  })

  test('removes the user and every trace in every collection', async () => {
    const destroy = jest.spyOn(cloudinary.uploader, 'destroy').mockResolvedValue({ result: 'ok' })
    const gone = await makeUser({ avatar: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/post_avatar.jpg' })
    const other = await makeUser()
    const third = await makeUser()

    const own = await Post.create({ type: 'social', text: 'own post to delete', postedBy: gone._id, college: 'Test College',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v2/nexus/post_img.png',
      pdfUrl: 'https://res.cloudinary.com/demo/raw/upload/v3/meetnet_pdfs/pdf_1', likes: [other._id] })
    const theirs = await Post.create({ type: 'social', text: 'other users post', postedBy: other._id, college: 'Test College',
      likes: [gone._id, third._id], replies: [{ text: 'from gone', postedBy: gone._id }, { text: 'from third', postedBy: third._id }], replyCount: 2 })
    await User.updateOne({ _id: other._id }, { $set: {
      following: [gone._id], followers: [gone._id], pendingRequests: [gone._id], sentRequests: [gone._id],
      blockedUsers: [gone._id], likedPosts: [own._id], savedPosts: [own._id, theirs._id] } })
    await Notification.create([
      { recipient: other._id, sender: gone._id, type: 'post_liked', message: 'x' },
      { recipient: gone._id, sender: other._id, type: 'post_liked', message: 'x' },
      { recipient: third._id, sender: other._id, type: 'post_replied', post: own._id, message: 'x' },
    ])
    await Report.create([
      { reportedBy: gone._id, post: theirs._id, reason: 'spam' },
      { reportedBy: other._id, targetType: 'user', user: gone._id, reason: 'spam' },
      { reportedBy: third._id, post: own._id, reason: 'spam' },
      { reportedBy: other._id, targetType: 'reply', post: theirs._id, replyId: theirs.replies[0]._id, reason: 'hate' },
    ])
    await PasswordReset.create({ user: gone._id, tokenHash: 'h'.repeat(64), expiresAt: new Date(Date.now() + 6e5) })

    const res = await as(gone, 'delete', '/api/users/me').send({ password: PASSWORD })
    expect(res.status).toBe(204)

    expect(await User.exists({ _id: gone._id })).toBeNull()
    expect(await Post.countDocuments({ postedBy: gone._id })).toBe(0)
    const t = await Post.findById(theirs._id).lean()
    expect(t.replies.map(r => r.text)).toEqual(['from third'])
    expect(t.replyCount).toBe(1)
    expect(t.likes.map(String)).toEqual([String(third._id)])
    const o = await fresh(other._id)
    for (const k of ['following', 'followers', 'pendingRequests', 'sentRequests', 'blockedUsers', 'likedPosts']) expect(o[k]).toEqual([])
    expect(o.savedPosts.map(String)).toEqual([String(theirs._id)])
    expect(await Notification.countDocuments({ $or: [{ sender: gone._id }, { recipient: gone._id }, { post: own._id }] })).toBe(0)
    expect(await Report.countDocuments({ reportedBy: gone._id })).toBe(0)                       // filed by them
    expect(await Report.countDocuments({ targetType: 'user', user: gone._id })).toBe(0)         // about them
    expect(await Report.countDocuments({ post: own._id })).toBe(0)                              // about their posts
    expect(await Report.countDocuments({ replyId: theirs.replies[0]._id })).toBe(0)             // about their replies
    expect(await PasswordReset.countDocuments({ user: gone._id })).toBe(0)

    const destroyed = destroy.mock.calls.map(c => `${c[1].resource_type}:${c[0]}`).sort()
    expect(destroyed).toEqual(['image:nexus/post_avatar', 'image:nexus/post_img', 'raw:meetnet_pdfs/pdf_1'])

    expect((await as(gone, 'get', '/api/users/me')).status).toBe(401)
  })
})

// ───────────────────────────────── B6 terms
describe('terms', () => {
  test('signup requires acceptTerms === true and records it', async () => {
    const body = { name: 'Terms Tester', email: 'terms@college.edu', password: PASSWORD, college: 'Test College' }
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    const ip = '198.51.100.77'
    expect((await request(app).post('/api/auth/signup').set('cf-connecting-ip', ip).send(body)).status).toBe(400)
    expect((await request(app).post('/api/auth/signup').set('cf-connecting-ip', ip).send({ ...body, acceptTerms: 'true' })).status).toBe(400)
    const ok = await request(app).post('/api/auth/signup').set('cf-connecting-ip', ip).send({ ...body, acceptTerms: true })
    expect(ok.status).toBe(201)
    expect(new Date(ok.body.user.termsAcceptedAt).getTime()).toBeGreaterThan(Date.now() - 60e3)
  })

  test('existing users can accept later', async () => {
    const u = await makeUser()
    expect((await as(u, 'get', '/api/users/me')).body.termsAcceptedAt).toBeNull()
    const res = await as(u, 'post', '/api/users/me/accept-terms')
    expect(res.status).toBe(200)
    expect((await as(u, 'get', '/api/users/me')).body.termsAcceptedAt).toBe(res.body.termsAcceptedAt)
  })
})

// ───────────────────────────────── pre-commit fixes
describe('following feed and validation errors', () => {
  test('connections feed never contains anonymous posts; college feed still does', async () => {
    const viewer = await makeUser({ college: 'Feed College' })
    const followed = await makeUser({ college: 'Feed College' })
    await User.updateOne({ _id: viewer._id }, { $set: { following: [followed._id] } })
    const named = await Post.create({ type: 'social', text: 'named post by followed', postedBy: followed._id, college: 'Feed College' })
    const anon = await Post.create({ type: 'confession', text: 'anon post by followed', isAnonymous: true, postedBy: followed._id, college: 'Feed College' })

    const following = (await as(viewer, 'get', '/api/posts?connections=true')).body.map(p => p._id)
    expect(following).toContain(String(named._id))
    expect(following).not.toContain(String(anon._id))

    const college = (await as(viewer, 'get', '/api/posts')).body.map(p => p._id)
    expect(college).toEqual(expect.arrayContaining([String(named._id), String(anon._id)]))
  })

  test('reply over 350 characters is a 400 with the validation message, and is not saved', async () => {
    const u = await makeUser()
    const post = await Post.create({ type: 'social', text: 'post for long reply', postedBy: u._id, college: 'Test College' })
    const res = await as(u, 'post', `/api/posts/${post._id}/replies`).send({ text: 'x'.repeat(351) })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ message: 'Reply too long' })
    const after = await Post.findById(post._id).lean()
    expect(after.replies).toHaveLength(0)
    expect(after.replyCount).toBe(0)
    expect((await as(u, 'post', `/api/posts/${post._id}/replies`).send({ text: 'x'.repeat(350) })).status).toBe(201)
  })

  test('other validation errors on post routes are 400 too', async () => {
    const u = await makeUser()
    const res = await as(u, 'post', '/api/posts').send({ type: 'social', text: 'y'.repeat(1001) })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/longer than the maximum allowed length/)
    expect((await as(u, 'put', '/api/posts/not-an-id/save')).status).toBe(400)   // CastError
  })
})

describe('signup password length', () => {
  test('new accounts need 8+ characters; existing 6-7 character passwords still log in', async () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    const body = { name: 'Short Pw', email: 'shortpw@college.edu', college: 'Test College', acceptTerms: true }
    const short = await request(app).post('/api/auth/signup').set('cf-connecting-ip', '198.51.100.88').send({ ...body, password: '1234567' })
    expect(short.status).toBe(400)
    expect(short.body.message).toBe('Password must be at least 8 characters')
    expect((await request(app).post('/api/auth/signup').set('cf-connecting-ip', '198.51.100.88').send({ ...body, password: '12345678' })).status).toBe(201)

    const legacy = await makeUser({ password: 'abc123' })          // 6 chars, created before the rule
    const login = await request(app).post('/api/auth/login').send({ email: legacy.email, password: 'abc123' })
    expect(login.status).toBe(200)
  })
})

// ───────────────────────────────── B7 app config
describe('GET /api/app/config', () => {
  test('shape, caching and safe defaults', async () => {
    const res = await request(app).get('/api/app/config')
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toBe('public, max-age=60')
    expect(res.body).toEqual({
      minVersion:    { ios: '0.0.0', android: '0.0.0' },
      latestVersion: { ios: '1.0.0', android: '1.0.0' },
      storeUrl:      { ios: '', android: 'https://play.google.com/store/apps/details?id=com.themeetnet.app' },
      features:      { confessionsEnabled: { ios: true, android: true }, pdfUploads: true },
      maintenance:   { enabled: false, message: '' },
    })
  })

  test('env overrides; invalid versions fall back', async () => {
    Object.assign(process.env, { APP_MIN_VERSION_ANDROID: '1.2.0', APP_MIN_VERSION_IOS: 'banana',
      APP_CONFESSIONS_IOS: 'false', APP_MAINTENANCE: '1', APP_MAINTENANCE_MESSAGE: 'Back soon' })
    try {
      const { body } = await request(app).get('/api/app/config')
      expect(body.minVersion).toEqual({ ios: '0.0.0', android: '1.2.0' })
      expect(body.features.confessionsEnabled.ios).toBe(false)
      expect(body.maintenance).toEqual({ enabled: true, message: 'Back soon' })
    } finally {
      for (const k of ['APP_MIN_VERSION_ANDROID', 'APP_MIN_VERSION_IOS', 'APP_CONFESSIONS_IOS', 'APP_MAINTENANCE', 'APP_MAINTENANCE_MESSAGE']) delete process.env[k]
    }
  })
})
