// POST / DELETE /api/users/me/push-token and POST /api/users/push-token/revoke: idempotent, at most 5 devices per user, rate limited
// per user, and a token belongs to one account only.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'

const request  = require('supertest')
const mongoose = require('mongoose')
const jwt      = require('jsonwebtoken')
const { MongoMemoryServer } = require('mongodb-memory-server')

const util = require('util')

const app  = require('../index')
const User = require('../models/User')
const notifySvc = require('../services/notify')
const { redactPushTokens } = require('../utils/redact')

let mongo

async function makeUser() {
  const n = Math.random().toString(36).slice(2, 8)
  const user = await User.create({
    name: `User ${n}`, username: `user_${n}`, email: `${n}@college.edu`,
    password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS',
  })
  return { id: user._id, auth: `Bearer ${jwt.sign({ id: user._id }, process.env.JWT_SECRET)}` }
}

const expoToken = (s) => `ExponentPushToken[${s}]`
const register = (user, body) => request(app).post('/api/users/me/push-token').set('Authorization', user.auth).send(body)
const tokensOf = async (user) => (await User.findById(user.id).select('+pushTokens').lean()).pushTokens

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('POST /api/users/me/push-token', () => {
  test('registering the same token again is idempotent: one entry, no write', async () => {
    const u = await makeUser()
    const body = { token: expoToken('same'), platform: 'android', deviceId: 'device-1' }
    expect((await register(u, body)).status).toBe(200)
    const [first] = await tokensOf(u)

    const again = await register(u, body)
    expect(again.status).toBe(200)
    expect(again.body.unchanged).toBe(true)
    const after = await tokensOf(u)
    expect(after).toHaveLength(1)
    // nothing was rewritten: the entry keeps its first timestamp
    expect(after[0].updatedAt.getTime()).toBe(first.updatedAt.getTime())
  })

  test('a device that gets a new token replaces its entry', async () => {
    const u = await makeUser()
    await register(u, { token: expoToken('old'), platform: 'android', deviceId: 'device-1' })
    await register(u, { token: expoToken('new'), platform: 'android', deviceId: 'device-1' })
    const list = await tokensOf(u)
    expect(list.map((t) => t.token)).toEqual([expoToken('new')])
  })

  test('keeps the 5 most recent devices, drops the oldest', async () => {
    const u = await makeUser()
    for (let i = 1; i <= 7; i++) {
      expect((await register(u, { token: expoToken(`t${i}`), platform: 'android', deviceId: `device-${i}` })).status).toBe(200)
    }
    const list = await tokensOf(u)
    expect(list.map((t) => t.deviceId)).toEqual(['device-3', 'device-4', 'device-5', 'device-6', 'device-7'])
  })

  test('a token moves to the account that registers it (same phone, different login)', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const body = { token: expoToken('shared-phone'), platform: 'android', deviceId: 'phone-1' }
    await register(a, body)
    await register(b, body)
    expect(await tokensOf(a)).toEqual([])
    expect((await tokensOf(b)).map((t) => t.token)).toEqual([expoToken('shared-phone')])
  })

  test('rate limited per user: the 11th request within the hour is refused, others are not affected', async () => {
    const u = await makeUser()
    for (let i = 1; i <= 10; i++) {
      expect((await register(u, { token: expoToken(`r${i}`), platform: 'android', deviceId: 'device-r' })).status).toBe(200)
    }
    const blocked = await register(u, { token: expoToken('r11'), platform: 'android', deviceId: 'device-r' })
    expect(blocked.status).toBe(429)
    expect((await tokensOf(u)).map((t) => t.token)).toEqual([expoToken('r10')])

    const other = await makeUser()
    expect((await register(other, { token: expoToken('other'), platform: 'ios', deviceId: 'device-o' })).status).toBe(200)
  })

  test('refuses bad input', async () => {
    const u = await makeUser()
    expect((await register(u, { token: 'not-a-token', platform: 'android', deviceId: 'd' })).status).toBe(400)
    expect((await register(u, { token: expoToken('x'), platform: 'web', deviceId: 'd' })).status).toBe(400)
    expect((await register(u, { token: expoToken('x'), platform: 'android', deviceId: '' })).status).toBe(400)
  })
})

describe('DELETE /api/users/me/push-token (logout)', () => {
  test('removes only this device', async () => {
    const u = await makeUser()
    await register(u, { token: expoToken('d1'), platform: 'android', deviceId: 'device-1' })
    await register(u, { token: expoToken('d2'), platform: 'ios', deviceId: 'device-2' })
    const res = await request(app).delete('/api/users/me/push-token').set('Authorization', u.auth).send({ deviceId: 'device-1' })
    expect(res.status).toBe(200)
    expect((await tokensOf(u)).map((t) => t.deviceId)).toEqual(['device-2'])
  })
})

describe('POST /api/users/push-token/revoke (after an offline logout, no login)', () => {
  const revoke = (body) => request(app).post('/api/users/push-token/revoke').send(body)

  test('removes that device\'s entry with no session; the account\'s other devices stay', async () => {
    const u = await makeUser()
    await register(u, { token: expoToken('phone'), platform: 'android', deviceId: 'phone-1' })
    await register(u, { token: expoToken('tablet'), platform: 'android', deviceId: 'tablet-1' })
    const res = await revoke({ userId: String(u.id), deviceId: 'phone-1', token: expoToken('phone') })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect((await tokensOf(u)).map((t) => t.deviceId)).toEqual(['tablet-1'])
  })

  test('without the matching token it removes nothing, and answers the same (no way to probe)', async () => {
    const u = await makeUser()
    await register(u, { token: expoToken('real'), platform: 'android', deviceId: 'phone-1' })
    for (const body of [
      { userId: String(u.id), deviceId: 'phone-1', token: expoToken('guess') },
      { userId: String(u.id), deviceId: 'other-device', token: expoToken('real') },
      { userId: String(new mongoose.Types.ObjectId()), deviceId: 'phone-1', token: expoToken('real') },
    ]) {
      const res = await revoke(body)
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ ok: true })
    }
    expect((await tokensOf(u)).map((t) => t.token)).toEqual([expoToken('real')])
  })

  test('only for the account it names: the same phone signed in as someone else keeps its pushes', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const body = { token: expoToken('shared'), platform: 'android', deviceId: 'phone-1' }
    await register(a, body)
    await register(b, body) // b signed in on the phone: the token moved to b
    await revoke({ userId: String(a.id), deviceId: 'phone-1', token: expoToken('shared') })
    expect((await tokensOf(b)).map((t) => t.token)).toEqual([expoToken('shared')])
  })

  test('refuses bad input', async () => {
    const u = await makeUser()
    const ok = { userId: String(u.id), deviceId: 'd', token: expoToken('x') }
    expect((await revoke({ ...ok, userId: 'not-an-id' })).status).toBe(400)
    expect((await revoke({ ...ok, userId: { $ne: null } })).status).toBe(400)
    expect((await revoke({ ...ok, token: 'not-a-token' })).status).toBe(400)
    expect((await revoke({ ...ok, deviceId: '' })).status).toBe(400)
  })

  // Each limit test gets its own client IPs (CLIENT_IP_HEADER, as behind Cloudflare)
  const fromIp = (ip, body) =>
    request(app).post('/api/users/push-token/revoke').set('cf-connecting-ip', ip).send(body)
  const withClientIpHeader = async (fn) => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip'
    try { await fn() } finally { delete process.env.CLIENT_IP_HEADER }
  }

  test('20 an hour per token: phones behind one carrier / college IP do not lock each other out', () =>
    withClientIpHeader(async () => {
      const u = await makeUser()
      const phone1 = { userId: String(u.id), deviceId: 'nat-1', token: expoToken('nat-phone-1') }
      for (let i = 0; i < 20; i++) expect((await fromIp('198.51.100.40', phone1)).status).toBe(200)
      expect((await fromIp('198.51.100.40', phone1)).status).toBe(429)
      // another phone on the same IP still gets through
      const phone2 = { userId: String(u.id), deviceId: 'nat-2', token: expoToken('nat-phone-2') }
      const other = await fromIp('198.51.100.40', phone2)
      expect(other.status).toBe(200)
      expect(other.headers['ratelimit-policy']).toBe('20;w=3600')
      // the limit follows the token, not the network it comes from
      expect((await fromIp('198.51.100.41', phone1)).status).toBe(429)
    }))

  test('a ceiling of 300 an hour per IP, whatever tokens it sends; other IPs are not affected', () =>
    withClientIpHeader(async () => {
      const u = await makeUser()
      const made = (i) => ({ userId: String(u.id), deviceId: `d${i}`, token: expoToken(`made-up-${i}`) })
      for (let i = 0; i < 300; i++) {
        const res = await fromIp('198.51.100.50', made(i))
        if (res.status !== 200) throw new Error(`request ${i + 1} got ${res.status}`)
      }
      expect((await fromIp('198.51.100.50', made('fresh'))).status).toBe(429)
      expect((await fromIp('198.51.100.51', made('fresh'))).status).toBe(200)
    }))
})

describe('logs never hold a whole push token', () => {
  const SECRET = 'ZZlogCheck1234567890abcd' // what must never appear in a log line
  const TOKEN = expoToken(SECRET)
  const SHOWN = 'ExponentPushToken[ZZlo…]' // what a log line may show instead
  let captured = []
  let spies = []

  beforeEach(() => {
    captured = []
    const grab = (...args) => { captured.push(args.map(a => (typeof a === 'string' ? a : util.inspect(a))).join(' ')) }
    const grabWrite = (chunk) => { captured.push(String(chunk)); return true }
    spies = [
      ...['log', 'info', 'warn', 'error', 'debug'].map(level => jest.spyOn(console, level).mockImplementation(grab)),
      jest.spyOn(process.stdout, 'write').mockImplementation(grabWrite), // morgan's request log
      jest.spyOn(process.stderr, 'write').mockImplementation(grabWrite),
    ]
  })
  afterEach(() => spies.forEach(s => s.mockRestore()))
  afterAll(() => notifySvc._setExpoClient({ chunkPushNotifications: () => [] }))

  const logs = () => captured.join('\n')

  test('register and revoke: success, bad input, rate limit, a database error', async () => {
    const u = await makeUser()
    const revoke = (body) => request(app).post('/api/users/push-token/revoke').send(body)
    expect((await register(u, { token: TOKEN, platform: 'android', deviceId: 'log-1' })).status).toBe(200)
    expect((await register(u, { token: TOKEN, platform: 'web', deviceId: 'log-1' })).status).toBe(400)
    expect((await revoke({ userId: String(u.id), deviceId: 'log-1', token: TOKEN })).status).toBe(200)
    expect((await revoke({ userId: 'nope', deviceId: 'log-1', token: TOKEN })).status).toBe(400)
    // a failing write: the error handler logs the error, which here quotes the token
    const fail = jest.spyOn(User, 'updateOne').mockRejectedValueOnce(new Error(`write failed for ${TOKEN}`))
    try {
      expect((await revoke({ userId: String(u.id), deviceId: 'log-1', token: TOKEN })).status).toBe(500)
    } finally {
      fail.mockRestore()
    }
    expect(logs()).toContain('/api/users/push-token/revoke') // the request log was captured
    expect(logs()).toContain(`write failed for ${SHOWN}`)
    expect(logs()).not.toContain(SECRET)
  })

  test('sending pushes: Expo error texts that quote the token are cut to a prefix', async () => {
    const to = await makeUser()
    const from = await makeUser()
    await register(to, { token: TOKEN, platform: 'android', deviceId: 'log-2' })
    notifySvc._setExpoClient({
      chunkPushNotifications: (messages) => [messages],
      sendPushNotificationsAsync: async (chunk) =>
        chunk.map(m => ({ status: 'error', message: `"${m.to}" is not a registered push notification recipient` })),
      chunkPushNotificationReceiptIds: (ids) => [ids],
      getPushNotificationReceiptsAsync: async (ids) =>
        Object.fromEntries(ids.map(id => [id, { status: 'error', message: `"${TOKEN}" could not be delivered` }])),
    })
    await notifySvc.notify({ recipient: to.id, sender: from.id, type: 'connection_request', message: 'wants to follow you' })
    await notifySvc.checkReceipts({ 'ticket-1': TOKEN })
    notifySvc._setExpoClient({
      chunkPushNotifications: (messages) => [messages],
      sendPushNotificationsAsync: async () => { throw new Error(`Invalid recipient ${TOKEN}`) },
    })
    await notifySvc.notify({ recipient: to.id, sender: from.id, type: 'connection_accepted', message: 'accepted' })

    expect(logs()).toContain(`push ticket error: "${SHOWN}" is not a registered`)
    expect(logs()).toContain(`push receipt error: "${SHOWN}" could not be delivered`)
    expect(logs()).toContain(`push: send failed: Invalid recipient ${SHOWN}`)
    expect(logs()).not.toContain(SECRET)
  })

  test('redactPushTokens keeps 4 characters of every token in a text', () => {
    expect(redactPushTokens('a ExponentPushToken[abcdefgh] b ExpoPushToken[12345678] c'))
      .toBe('a ExponentPushToken[abcd…] b ExpoPushToken[1234…] c')
    expect(redactPushTokens('no token here')).toBe('no token here')
    expect(redactPushTokens(undefined)).toBe('')
  })
})
