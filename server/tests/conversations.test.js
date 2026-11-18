// Direct messages (routes/conversations.js, services/directMessages.js): feature switch, requests
// (one message until accepted, decline, limits), messages (read, delivered, reply, unsend, delete
// for me, delete chat), photos, reports, blocking, account deletion, independence from MeetNow,
// and the Socket.IO events (new message, typing, delivered, read, presence).
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'
process.env.ADMIN_EMAIL      = 'admin@college.edu'
process.env.ADMIN_SECRET_KEY = 'test-admin-key'
process.env.FEATURE_DM       = 'on'
process.env.FEATURE_MEETNOW  = 'on'
// Local-disk uploads for this suite (no Cloudinary)
for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) delete process.env[k]
process.env.LOCAL_UPLOAD_DIR = require('path').join(require('os').tmpdir(), `meetnet-dm-${process.pid}`)

const fs       = require('fs')
const http     = require('http')
const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { io: connect } = require('socket.io-client')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app           = require('../index')
const User          = require('../models/User')
const Conversation  = require('../models/Conversation')
const DirectMessage = require('../models/DirectMessage')
const Report        = require('../models/Report')
const realtime      = require('../realtime/socket')
const { signToken } = require('../utils/token')
const { localUploadFile } = require('../config/uploadMode')

let mongo
const PASSWORD = 'secret123'
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a5f9b0d40000000049454e44ae426082', 'hex')

function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({ name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`, password: PASSWORD,
    college: 'Test College', year: '2nd', branch: 'CS', ...overrides })
}
const fresh = id => User.findById(id)
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`)
const follow = (a, b) => User.updateOne({ _id: a._id }, { $addToSet: { following: b._id } })   // a follows b
async function chat(a, b) {   // an accepted conversation: b follows a, so a's message goes straight in
  await follow(b, a)
  const r = await as(a, 'post', '/api/conversations').send({ userId: b._id })
  return r.body
}
const say = (u, convId, body) => as(u, 'post', `/api/conversations/${convId}/messages`).send(typeof body === 'string' ? { text: body } : body)
const list = async (u, tab = 'chats', q = '') => (await as(u, 'get', `/api/conversations?tab=${tab}${q}`)).body

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([User.init(), Conversation.init(), DirectMessage.init(), Report.init()])
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
  fs.rmSync(process.env.LOCAL_UPLOAD_DIR, { recursive: true, force: true })
})
afterEach(() => { process.env.FEATURE_DM = 'on' })

// ───────────────────────────────── feature switch
describe('feature switch', () => {
  test('off: the normal 404 everywhere, also without a token', async () => {
    delete process.env.FEATURE_DM
    const a = await makeUser()
    for (const [m, url] of [['get', '/api/conversations'], ['post', '/api/conversations'], ['get', '/api/conversations/unread-count']]) {
      const r = await as(a, m, url).send({ userId: a._id })
      expect(r.status).toBe(404)
      expect(r.body.message).toMatch(/^Route .* not found$/)
    }
    expect((await request(app).get('/api/conversations')).status).toBe(404)
    expect((await request(app).get('/api/app/config')).body.features.dmEnabled).toBe(false)
  })

  test('staff: only granted accounts, and only to granted accounts', async () => {
    process.env.FEATURE_DM = 'staff'
    const a = await makeUser({ featureAccess: ['dm'] })
    const b = await makeUser({ featureAccess: ['dm'] })
    const c = await makeUser()
    expect((await as(c, 'get', '/api/conversations')).status).toBe(404)
    expect((await as(a, 'get', '/api/conversations')).status).toBe(200)
    const toC = await as(a, 'post', '/api/conversations').send({ userId: c._id })
    expect(toC.status).toBe(404)                      // c can't receive messages yet
    expect((await as(a, 'post', '/api/conversations').send({ userId: b._id })).status).toBe(201)
    expect((await as(a, 'get', '/api/app/features')).body).toMatchObject({ dm: true })
  })
})

// ───────────────────────────────── opening a conversation
describe('opening a conversation', () => {
  test('active when they follow you, a request otherwise; one conversation per pair', async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser()
    await follow(b, a)
    const ab = await as(a, 'post', '/api/conversations').send({ userId: b._id })
    expect(ab.status).toBe(201)
    expect(ab.body).toMatchObject({ status: 'active', isRequest: false, other: { _id: String(b._id), name: b.name } })
    const again = await as(b, 'post', '/api/conversations').send({ userId: a._id })
    expect(again.status).toBe(200)
    expect(again.body._id).toBe(ab.body._id)
    const ac = await as(a, 'post', '/api/conversations').send({ userId: c._id })
    expect(ac.body).toMatchObject({ status: 'request', isRequest: true, requestedByMe: true })
    expect(await Conversation.countDocuments({ pairKey: Conversation.pairKeyOf(a._id, b._id) })).toBe(1)
  })

  test('not yourself, not a missing account, not across a block', async () => {
    const a = await makeUser(), b = await makeUser()
    expect((await as(a, 'post', '/api/conversations').send({ userId: a._id })).status).toBe(400)
    expect((await as(a, 'post', '/api/conversations').send({ userId: new mongoose.Types.ObjectId() })).status).toBe(404)
    expect((await as(a, 'post', '/api/conversations').send({ userId: 'nope' })).status).toBe(400)
    await User.updateOne({ _id: b._id }, { $push: { blockedUsers: a._id } })
    const r = await as(a, 'post', '/api/conversations').send({ userId: b._id })
    expect(r.status).toBe(403)
    expect(r.body.code).toBe('BLOCKED')
  })

  test('limits: 10 message requests a day', async () => {
    const a = await makeUser()
    const targets = await Promise.all(Array.from({ length: 11 }, () => makeUser()))
    for (const t of targets.slice(0, 10)) expect((await as(a, 'post', '/api/conversations').send({ userId: t._id })).status).toBe(201)
    const eleventh = await as(a, 'post', '/api/conversations').send({ userId: targets[10]._id })
    expect(eleventh.status).toBe(429)
    expect(eleventh.body.code).toBe('REQUEST_LIMIT')
    // people who follow you are still reachable (they don't count as requests)
    const friend = await makeUser()
    await follow(friend, a)
    expect((await as(a, 'post', '/api/conversations').send({ userId: friend._id })).status).toBe(201)
  })
})

// ───────────────────────────────── requests
describe('message requests', () => {
  test('one text message until accepted; it waits in their Requests tab', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = (await as(a, 'post', '/api/conversations').send({ userId: b._id })).body
    expect((await say(a, conv._id, 'you idiot fuck')).body.code).toBe('PROFANITY')
    expect((await say(a, conv._id, 'Hi! Saw your project post 👋')).status).toBe(201)
    const second = await say(a, conv._id, 'hello?')
    expect(second.status).toBe(403)
    expect(second.body.code).toBe('REQUEST_PENDING')

    expect((await list(a)).map(c => c._id)).toContain(conv._id)              // my chats
    expect((await list(b)).map(c => c._id)).not.toContain(conv._id)          // not in their chats…
    expect((await list(b, 'requests')).map(c => c._id)).toEqual([conv._id])  // …but in their requests
    expect((await as(b, 'get', '/api/conversations/unread-count')).body).toEqual({ chats: 0, requests: 1 })
    expect((await as(a, 'post', `/api/conversations/${conv._id}/accept`)).status).toBe(400)   // not the receiver

    expect((await as(b, 'post', `/api/conversations/${conv._id}/accept`)).body).toEqual({ status: 'active' })
    expect((await say(a, conv._id, 'thanks!')).status).toBe(201)
    expect((await list(b)).map(c => c._id)).toContain(conv._id)
  })

  test('a request tells its sender nothing: no activity status, no "delivered" when opened', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = (await as(a, 'post', '/api/conversations').send({ userId: b._id })).body
    const m = (await say(a, conv._id, 'hello')).body
    await User.updateOne({ _id: b._id }, { $set: { lastActiveAt: new Date() } })
    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.activity).toBeNull()
    expect((await list(a))[0].activity).toBeNull()
    await as(b, 'get', `/api/conversations/${conv._id}/messages`)       // b opens the request
    await as(b, 'post', `/api/conversations/${conv._id}/read`)
    expect((await DirectMessage.findById(m._id)).deliveredAt).toBeNull()
    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.otherLastReadAt).toBeNull()
    await as(b, 'post', `/api/conversations/${conv._id}/accept`)
    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.activity).toMatchObject({ lastActiveAt: expect.any(String) })
  })

  test('a photo cannot be the request message; replying accepts', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = (await as(a, 'post', '/api/conversations').send({ userId: b._id })).body
    const up = await as(a, 'post', '/api/conversations/upload-image').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect((await say(a, conv._id, { imageUrl: up.body.url })).body.code).toBe('REQUEST_TEXT_ONLY')
    await say(a, conv._id, 'hello')
    expect((await say(b, conv._id, 'hey!')).status).toBe(201)
    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.status).toBe('active')
  })

  test('decline: gone for the receiver; the sender is not told and cannot send more', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = (await as(a, 'post', '/api/conversations').send({ userId: b._id })).body
    await say(a, conv._id, 'hello')
    expect((await as(b, 'post', `/api/conversations/${conv._id}/decline`)).body).toEqual({ status: 'declined' })
    expect((await as(b, 'get', `/api/conversations/${conv._id}`)).status).toBe(404)
    expect(await list(b, 'requests')).toEqual([])
    const seen = (await as(a, 'get', `/api/conversations/${conv._id}`)).body
    expect(seen).toMatchObject({ status: 'request', isRequest: true })      // still "request" for the sender
    expect((await say(a, conv._id, 'again')).body.code).toBe('REQUEST_PENDING')
    // later the receiver writes themselves: a normal chat
    const reopened = await as(b, 'post', '/api/conversations').send({ userId: a._id })
    expect(reopened.body).toMatchObject({ _id: conv._id, status: 'active' })
    expect((await say(b, conv._id, 'sorry, hi!')).status).toBe(201)
    expect((await as(b, 'get', `/api/conversations/${conv._id}/messages`)).body.map(m => m.text)).toEqual(['sorry, hi!'])
  })
})

// ───────────────────────────────── messages
describe('messages', () => {
  test('send, unread, delivered when fetched, read receipts, replies, search', async () => {
    const a = await makeUser({ name: 'Asha Patil' }), b = await makeUser({ name: 'Rohan Singh' })
    const conv = await chat(a, b)
    const m1 = (await say(a, conv._id, '  first  ')).body
    expect(m1).toMatchObject({ text: 'first', mine: true, deliveredAt: null, image: null, replyTo: null })
    await say(a, conv._id, 'second')
    expect((await as(b, 'get', '/api/conversations/unread-count')).body).toEqual({ chats: 1, requests: 0 })
    expect((await list(b))[0]).toMatchObject({ unread: 2, lastMessage: { text: 'second', mine: false } })

    const got = (await as(b, 'get', `/api/conversations/${conv._id}/messages`)).body
    expect(got.map(m => m.text)).toEqual(['first', 'second'])
    expect(got.every(m => !m.mine)).toBe(true)
    expect((await DirectMessage.findById(m1._id)).deliveredAt).not.toBeNull()

    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.otherLastReadAt).toBeNull()
    await as(b, 'post', `/api/conversations/${conv._id}/read`)
    expect((await as(a, 'get', `/api/conversations/${conv._id}`)).body.otherLastReadAt).not.toBeNull()
    expect((await as(b, 'get', '/api/conversations/unread-count')).body).toEqual({ chats: 0, requests: 0 })

    const reply = (await say(b, conv._id, { text: 'answer', replyTo: m1._id })).body
    expect(reply.replyTo).toMatchObject({ message: m1._id, text: 'first', senderName: 'Asha Patil' })

    expect((await list(a, 'chats', '&search=rohan')).map(c => c._id)).toEqual([conv._id])
    expect(await list(a, 'chats', '&search=nobody')).toEqual([])
    for (const body of [{ text: '' }, { text: '   ' }, { text: 'x'.repeat(2001) }, { imageUrl: 'https://evil.example/x.jpg' }]) {
      expect((await say(a, conv._id, body)).status).toBe(400)
    }
  })

  test('catching up: ?after= returns only what came since, oldest first', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const first = (await say(a, conv._id, 'one')).body
    await new Promise(r => setTimeout(r, 5))
    await say(b, conv._id, 'two'); await say(a, conv._id, 'three')
    const since = (await as(b, 'get', `/api/conversations/${conv._id}/messages?after=${encodeURIComponent(first.createdAt)}`)).body
    expect(since.map(m => m.text)).toEqual(['two', 'three'])
    const page = (await as(b, 'get', `/api/conversations/${conv._id}/messages?after=${encodeURIComponent(first.createdAt)}&limit=1`)).body
    expect(page.map(m => m.text)).toEqual(['two'])
  })

  test('only the members can read or write', async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser()
    const conv = await chat(a, b)
    await say(a, conv._id, 'private')
    for (const [m, url] of [['get', ''], ['get', '/messages'], ['post', '/messages'], ['post', '/read'], ['delete', '']]) {
      expect((await as(c, m, `/api/conversations/${conv._id}${url}`).send({ text: 'x' })).status).toBe(404)
    }
  })

  test('unsend deletes it for both (and fixes the unread count); delete for me hides it only for me', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const keep = (await say(a, conv._id, 'keep')).body
    const oops = (await say(a, conv._id, 'oops')).body
    expect((await as(b, 'delete', `/api/conversations/${conv._id}/messages/${oops._id}?for=everyone`)).status).toBe(403)
    expect((await as(a, 'delete', `/api/conversations/${conv._id}/messages/${oops._id}?for=everyone`)).body).toEqual({ unsent: true })
    expect(await DirectMessage.countDocuments({ _id: oops._id })).toBe(0)
    expect((await list(b))[0]).toMatchObject({ unread: 1, lastMessage: { text: 'keep' } })
    expect((await as(b, 'delete', `/api/conversations/${conv._id}/messages/${keep._id}`)).body).toEqual({ hidden: true })
    expect((await as(b, 'get', `/api/conversations/${conv._id}/messages`)).body).toEqual([])
    expect((await as(a, 'get', `/api/conversations/${conv._id}/messages`)).body.map(m => m.text)).toEqual(['keep'])
  })

  test('delete chat: hidden for one; deleted for good when both delete it', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    await say(a, conv._id, 'one'); await say(b, conv._id, 'two')
    await as(a, 'delete', `/api/conversations/${conv._id}`)
    expect(await list(a)).toEqual([])
    expect((await as(a, 'get', `/api/conversations/${conv._id}/messages`)).body).toEqual([])
    expect((await as(b, 'get', `/api/conversations/${conv._id}/messages`)).body).toHaveLength(2)
    await say(b, conv._id, 'three')                                   // a sees it again, from here on
    expect((await as(a, 'get', `/api/conversations/${conv._id}/messages`)).body.map(m => m.text)).toEqual(['three'])
    await as(a, 'delete', `/api/conversations/${conv._id}`)
    await as(b, 'delete', `/api/conversations/${conv._id}`)
    expect(await DirectMessage.countDocuments({ conversation: conv._id })).toBe(0)
    expect(await Conversation.countDocuments({ _id: conv._id })).toBe(0)
  })

  test('blocking: hidden from both lists, no new messages; unblocking brings it back', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    await say(a, conv._id, 'hi')
    await as(b, 'post', `/api/users/${a._id}/block`)
    expect(await list(a)).toEqual([])
    expect(await list(b)).toEqual([])
    expect((await say(a, conv._id, 'still there?')).body.code).toBe('BLOCKED')
    expect((await as(b, 'get', `/api/conversations/${conv._id}`)).body.blocked).toBe(true)
    await as(b, 'post', `/api/users/${a._id}/unblock`)
    expect((await list(a)).map(c => c._id)).toEqual([conv._id])
  })
})

// ───────────────────────────────── photos
describe('photos', () => {
  test('upload, send, unsend deletes the file; only our uploads can be attached', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const up = await as(a, 'post', '/api/conversations/upload-image').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(up.status).toBe(200)
    expect(up.body.url).toMatch(/\/uploads\/dm\/dm_\d+_[0-9a-f]+\.png$/)
    const file = localUploadFile(up.body.url)
    expect(fs.existsSync(file)).toBe(true)
    const sent = (await say(a, conv._id, { imageUrl: up.body.url, text: 'look' })).body
    expect(sent.image.url).toBe(up.body.url)
    expect((await list(b))[0].lastMessage).toMatchObject({ image: true, text: 'look' })
    const postImage = await as(a, 'post', '/api/posts/upload-image').attach('image', PNG, { filename: 'p.png', contentType: 'image/png' })
    expect((await say(a, conv._id, { imageUrl: postImage.body.url })).body.code).toBe('INVALID_IMAGE')
    await as(a, 'delete', `/api/conversations/${conv._id}/messages/${sent._id}?for=everyone`)
    expect(fs.existsSync(file)).toBe(false)
    const bad = await as(a, 'post', '/api/conversations/upload-image').attach('image', Buffer.from('not a png'), { filename: 'x.png', contentType: 'image/png' })
    expect(bad.status).toBe(400)
  })
})

// ───────────────────────────────── activity status
describe('activity status', () => {
  test('a setting on /users/me; never on public profiles', async () => {
    const a = await makeUser(), b = await makeUser()
    expect((await as(a, 'put', '/api/users/me').send({ showActivityStatus: 'no' })).status).toBe(400)
    const r = await as(a, 'put', '/api/users/me').send({ showActivityStatus: false })
    expect(r.body.showActivityStatus).toBe(false)
    const profile = (await as(b, 'get', `/api/users/${a._id}`)).body
    expect(profile.showActivityStatus).toBeUndefined()
    expect(profile.lastActiveAt).toBeUndefined()
    const conv = await chat(b, a)
    expect((await as(b, 'get', `/api/conversations/${conv._id}`)).body.activity).toBeNull()
    await as(a, 'put', '/api/users/me').send({ showActivityStatus: true })
    expect((await as(b, 'get', `/api/conversations/${conv._id}`)).body.activity).toMatchObject({ online: false })
  })
})

// ───────────────────────────────── reports
describe('reports', () => {
  test('a reported message keeps a 90-day copy for the admin', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const m = (await say(a, conv._id, 'nasty message')).body
    expect((await as(a, 'post', `/api/conversations/${conv._id}/messages/${m._id}/report`).send({ reason: 'spam' })).status).toBe(400)
    expect((await as(b, 'post', `/api/conversations/${conv._id}/messages/${m._id}/report`).send({ reason: 'harassment' })).status).toBe(200)
    expect((await as(b, 'post', `/api/conversations/${conv._id}/messages/${m._id}/report`).send({ reason: 'harassment' })).status).toBe(400)
    await as(a, 'delete', `/api/conversations/${conv._id}/messages/${m._id}?for=everyone`)   // unsent afterwards
    const r = await Report.findOne({ reportedBy: b._id, targetType: 'direct_message' }).lean()
    expect(r.snapshot).toMatchObject({ text: 'nasty message', senderName: a.name })
    expect((r.expiresAt - r.createdAt) / 864e5).toBeCloseTo(90, 1)
    const admin = await User.findOne({ email: process.env.ADMIN_EMAIL }) || await makeUser({ email: process.env.ADMIN_EMAIL })
    const all = (await as(admin, 'get', '/api/posts/admin/reports').set('x-admin-key', 'test-admin-key')).body
    expect(all.find(x => String(x._id) === String(r._id)).snapshot.text).toBe('nasty message')
  })
})

// ───────────────────────────────── account deletion and MeetNow
describe('lifecycle', () => {
  test('deleting an account deletes its conversations, messages and photos on both sides', async () => {
    const gone = await makeUser(), other = await makeUser()
    const conv = await chat(gone, other)
    const up = await as(gone, 'post', '/api/conversations/upload-image').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
    const m = (await say(gone, conv._id, { imageUrl: up.body.url })).body
    await say(other, conv._id, 'reply from the other person')
    await as(other, 'post', `/api/conversations/${conv._id}/messages/${m._id}/report`).send({ reason: 'spam' })
    expect((await as(gone, 'delete', '/api/users/me').send({ password: PASSWORD })).status).toBe(204)
    expect(await Conversation.countDocuments({ _id: conv._id })).toBe(0)
    expect(await DirectMessage.countDocuments({ conversation: conv._id })).toBe(0)
    expect(fs.existsSync(localUploadFile(up.body.url))).toBe(false)
    expect(await Report.countDocuments({ 'snapshot.sender': gone._id })).toBe(0)
    expect(await list(other)).toEqual([])
  })

  test('a MeetNow ending never touches direct messages', async () => {
    const a = await makeUser(), b = await makeUser()
    const meetup = (await as(a, 'post', '/api/meetups').send({ title: 'Study together', category: 'study', location: 'Library', visibility: 'college' })).body
    await as(b, 'post', `/api/meetups/${meetup._id}/join`)
    const conv = await chat(a, b)
    await say(a, conv._id, 'met you at the MeetNow!')
    await as(a, 'delete', `/api/meetups/${meetup._id}`)
    await require('../services/meetupLifecycle').sweep(new Date(Date.now() + 365 * 864e5))   // as if a year passed
    expect((await as(b, 'get', `/api/conversations/${conv._id}/messages`)).body.map(m => m.text)).toEqual(['met you at the MeetNow!'])
  })
})

// ───────────────────────────────── realtime
describe('Socket.IO', () => {
  let server, url
  const sockets = []
  beforeAll(done => {
    server = http.createServer(app)
    realtime.attach(server, { corsOrigin: true })
    server.listen(0, '127.0.0.1', () => { url = `http://127.0.0.1:${server.address().port}`; done() })
  })
  afterAll(done => {
    sockets.forEach(s => s.close())
    realtime.getIO().close()
    server.close(() => done())
  })
  const open = token => new Promise((resolve, reject) => {
    const s = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true })
    sockets.push(s)
    s.on('connect', () => resolve(s))
    s.on('connect_error', reject)
  })
  const next = (s, event, pred = () => true) => new Promise(resolve => {
    const h = p => { if (pred(p)) { s.off(event, h); resolve(p) } }
    s.on(event, h)
  })
  const none = (s, event, ms = 600) => new Promise(resolve => {
    const h = () => { clearTimeout(t); s.off(event, h); resolve(false) }
    const t = setTimeout(() => { s.off(event, h); resolve(true) }, ms)
    s.on(event, h)
  })

  test('new messages, typing, delivered and read arrive live', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const sa = await open(signToken(a)), sb = await open(signToken(b))
    const incoming = next(sb, 'dm:new')
    const sent = (await say(a, conv._id, 'live hello')).body
    expect(await incoming).toMatchObject({ conversationId: conv._id, message: { _id: sent._id, text: 'live hello', mine: false } })

    const typing = next(sa, 'dm:typing')
    sb.emit('dm:typing', { conversationId: conv._id })
    expect(await typing).toEqual({ conversationId: conv._id })

    const delivered = next(sa, 'dm:delivered')
    sb.emit('dm:delivered', { conversationId: conv._id })
    expect((await delivered).conversationId).toBe(conv._id)
    expect((await DirectMessage.findById(sent._id)).deliveredAt).not.toBeNull()

    const read = next(sa, 'dm:read')
    await as(b, 'post', `/api/conversations/${conv._id}/read`)
    expect((await read).conversationId).toBe(conv._id)
  })

  test('unsend reaches the other person live', async () => {
    const a = await makeUser(), b = await makeUser()
    const conv = await chat(a, b)
    const sb = await open(signToken(b))
    const m = (await say(a, conv._id, 'oops')).body
    const unsent = next(sb, 'dm:unsent', p => p.messageId === m._id)
    expect((await as(a, 'delete', `/api/conversations/${conv._id}/messages/${m._id}?for=everyone`)).body).toEqual({ unsent: true })
    expect(await unsent).toEqual({ conversationId: conv._id, messageId: m._id })
  })

  test('the production sequence: typing, delivered, read, reply, photo, then unsend arrives live', async () => {
    const a = await makeUser(), b = await makeUser()
    const sa = await open(signToken(a)), sb = await open(signToken(b))
    const conv = await chat(a, b)
    const m1 = (await say(a, conv._id, 'hello')).body
    sb.emit('dm:typing', { conversationId: conv._id })
    const delivered = next(sa, 'dm:delivered'); sb.emit('dm:delivered', { conversationId: conv._id }); await delivered
    await as(b, 'post', `/api/conversations/${conv._id}/read`)
    await say(b, conv._id, { text: 'reply', replyTo: m1._id })
    const up = await as(a, 'post', '/api/conversations/upload-image').attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
    const pm = (await say(a, conv._id, { imageUrl: up.body.url })).body
    const unsent = next(sb, 'dm:unsent', p => p.messageId === pm._id)
    expect((await as(a, 'delete', `/api/conversations/${conv._id}/messages/${pm._id}?for=everyone`)).status).toBe(200)
    expect(await unsent).toEqual({ conversationId: conv._id, messageId: pm._id })
  })

  test('typing is not shown in requests or to strangers', async () => {
    const a = await makeUser(), b = await makeUser(), c = await makeUser()
    const req = (await as(a, 'post', '/api/conversations').send({ userId: b._id })).body
    const sb = await open(signToken(b)), sc = await open(signToken(c))
    const sa = await open(signToken(a))
    const noneB = none(sb, 'dm:typing')
    sa.emit('dm:typing', { conversationId: req._id })
    expect(await noneB).toBe(true)
    const noneA = none(sa, 'dm:typing')
    sc.emit('dm:typing', { conversationId: req._id })
    expect(await noneA).toBe(true)
  })

  test('presence: partners learn when you come online and go offline, unless either hid it', async () => {
    const a = await makeUser(), b = await makeUser(), hidden = await makeUser({ showActivityStatus: false })
    await chat(a, b)
    await chat(hidden, b)
    const sb = await open(signToken(b))
    const cameOnline = next(sb, 'dm:presence', p => p.userId === String(a._id) && p.online)
    const sa = await open(signToken(a))
    expect(await cameOnline).toMatchObject({ online: true })
    expect(realtime.isOnline(a._id)).toBe(true)
    const wentOffline = next(sb, 'dm:presence', p => p.userId === String(a._id) && !p.online)
    sa.close()
    expect(await wentOffline).toMatchObject({ online: false })
    expect((await User.findById(a._id).select('+lastActiveAt')).lastActiveAt).not.toBeNull()

    const quiet = none(sb, 'dm:presence', 800)
    await open(signToken(hidden))
    expect(await quiet).toBe(true)
  })
})
