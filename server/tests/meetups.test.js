// MeetNow (routes/meetups.js, services/meetupLifecycle.js): feature switch and staff allowlist,
// create/join/leave/end, expiry exact to the second, complete deletion, reports with snapshots,
// account deletion, and the Socket.IO delivery (realtime/socket.js).
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'
process.env.ADMIN_EMAIL      = 'admin@college.edu'
process.env.ADMIN_SECRET_KEY = 'test-admin-key'
process.env.FEATURE_MEETNOW  = 'on'
process.env.LOCAL_UPLOAD_DIR = require('path').join(require('os').tmpdir(), `meetnet-meetups-${process.pid}`)

const http     = require('http')
const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { io: connect } = require('socket.io-client')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app           = require('../index')
const User          = require('../models/User')
const Meetup        = require('../models/Meetup')
const MeetupMember  = require('../models/MeetupMember')
const MeetupMessage = require('../models/MeetupMessage')
const Report        = require('../models/Report')
const life          = require('../services/meetupLifecycle')
const realtime      = require('../realtime/socket')
const { signToken } = require('../utils/token')

let mongo
const PASSWORD = 'secret123'

function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({
    name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`, password: PASSWORD,
    college: 'Test College', year: '2nd', branch: 'CS', ...overrides,
  })
}
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`)
const meetupBody = (extra = {}) => ({ title: 'Cricket after class', category: 'sports', location: 'Main ground', visibility: 'college', ...extra })
async function start(user, extra) {
  const res = await as(user, 'post', '/api/meetups').send(meetupBody(extra))
  expect(res.status).toBe(201)
  return res.body
}
// Moves a meetup (and its rows) to the past, as if its time had run out
async function expire(id) {
  const past = new Date(Date.now() - 1000)
  await Meetup.updateOne({ _id: id }, { expiresAt: past })
  await MeetupMember.updateMany({ meetup: id }, { expiresAt: past })
  await MeetupMessage.updateMany({ meetup: id }, { expiresAt: past })
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([User.init(), Meetup.init(), MeetupMember.init(), MeetupMessage.init(), Report.init()])
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
afterEach(() => { process.env.FEATURE_MEETNOW = 'on' })

// ───────────────────────────────── feature switch
describe('feature switch and staff allowlist', () => {
  test('off (the default): every route is the ordinary 404, even without a token', async () => {
    delete process.env.FEATURE_MEETNOW
    const u = await makeUser()
    for (const [m, url] of [['get', '/api/meetups'], ['post', '/api/meetups'], ['get', `/api/meetups/${u._id}`]]) {
      const res = await as(u, m, url).send(meetupBody())
      expect(res.status).toBe(404)
      expect(res.body.message).toMatch(/^Route .* not found$/)
    }
    expect((await request(app).get('/api/meetups')).status).toBe(404)
    expect((await as(u, 'get', '/api/app/features')).body).toEqual({ meetnow: false, dm: false })
    expect((await request(app).get('/api/app/config')).body.features).toMatchObject({ meetnowEnabled: false, dmEnabled: false })
  })

  test('staff: only the admin and granted accounts; the public config stays false', async () => {
    process.env.FEATURE_MEETNOW = 'staff'
    const admin = await User.findOne({ email: process.env.ADMIN_EMAIL }) || await makeUser({ email: process.env.ADMIN_EMAIL })
    const tester = await makeUser()
    const other = await makeUser()

    expect((await as(other, 'get', '/api/meetups')).status).toBe(404)
    expect((await request(app).get('/api/meetups')).status).toBe(404)
    expect((await as(admin, 'get', '/api/meetups')).status).toBe(200)
    expect((await request(app).get('/api/app/config')).body.features.meetnowEnabled).toBe(false)

    // Granting needs the admin token AND the admin key; otherwise the route does not exist
    const grant = body => as(admin, 'post', '/api/app/feature-access').set('x-admin-key', 'test-admin-key').send(body)
    expect((await as(admin, 'post', '/api/app/feature-access').send({ email: tester.email, feature: 'meetnow', grant: true })).status).toBe(404)
    expect((await as(tester, 'post', '/api/app/feature-access').set('x-admin-key', 'test-admin-key').send({ email: tester.email, feature: 'meetnow', grant: true })).status).toBe(404)
    const g = await grant({ email: tester.email.toUpperCase(), feature: 'meetnow', grant: true })
    expect(g.status).toBe(200)
    expect(g.body.features).toEqual(['meetnow'])
    expect((await grant({ email: 'nobody@college.edu', feature: 'meetnow', grant: true })).status).toBe(404)
    expect((await grant({ email: tester.email, feature: 'chat', grant: true })).status).toBe(400)

    expect((await as(tester, 'get', '/api/meetups')).status).toBe(200)
    const f = await as(tester, 'get', '/api/app/features')
    expect(f.body).toEqual({ meetnow: true, dm: false })
    expect(f.headers['cache-control']).toBe('private, no-store')
    const list = await as(admin, 'get', '/api/app/feature-access').set('x-admin-key', 'test-admin-key')
    expect(list.body.modes).toEqual({ meetnow: 'staff', dm: 'off' })
    expect(list.body.accounts.map(a => a.email)).toContain(tester.email)

    // never exposed on profiles or /me
    const me = await as(tester, 'get', '/api/users/me')
    expect(me.body.featureAccess).toBeUndefined()
    expect((await as(other, 'get', `/api/users/${tester._id}`)).body.featureAccess).toBeUndefined()

    await grant({ email: tester.email, feature: 'meetnow', grant: false })
    expect((await as(tester, 'get', '/api/meetups')).status).toBe(404)
  })
})

// ───────────────────────────────── create
describe('create', () => {
  test('default 24 h, custom 15 min – 72 h, "until I leave" capped at 24 h', async () => {
    const u = await makeUser()
    const t0 = Date.now()
    const a = await start(u)
    const hours = m => (new Date(m.expiresAt) - t0) / 3600e3
    expect(hours(a)).toBeGreaterThan(23.99); expect(hours(a)).toBeLessThan(24.01)
    expect(a).toMatchObject({ memberCount: 1, joined: true, isCreator: true, endsWhenCreatorLeaves: false, category: 'sports' })
    const b = await start(u, { durationMinutes: 15 })
    expect(hours(b) * 60).toBeCloseTo(15, 0)
    const c = await start(u, { duration: 'until_leave' })
    expect(c.endsWhenCreatorLeaves).toBe(true)
    expect(hours(c)).toBeLessThan(24.01)
    for (const durationMinutes of [14, 4321, 30.5, 'abc', -5]) {
      expect((await as(u, 'post', '/api/meetups').send(meetupBody({ durationMinutes }))).status).toBe(400)
    }
  })

  test('validation, profanity, "nearby" not offered, 3 active per creator', async () => {
    const u = await makeUser()
    const bad = [{ title: 'ab' }, { title: 'x'.repeat(81) }, { location: '' }, { category: 'party' },
      { visibility: 'nearby' }, { description: 'x'.repeat(301) }, { title: 'fuck this meetup' }]
    for (const b of bad) expect((await as(u, 'post', '/api/meetups').send(meetupBody(b))).status).toBe(400)
    await start(u); await start(u); await start(u)
    // refused attempts above did not count towards the 10 per day
    const fourth = await as(u, 'post', '/api/meetups').send(meetupBody())
    expect(fourth.status).toBe(429)
    expect(fourth.body.code).toBe('TOO_MANY_ACTIVE')
  })
})

// ───────────────────────────────── discovery and visibility
describe('discovery', () => {
  test('college meetups only for that college; everyone-meetups for all; blocks either way hide them', async () => {
    const a = await makeUser({ college: 'Alpha College' })
    const b = await makeUser({ college: 'Alpha College' })
    const c = await makeUser({ college: 'Beta College' })
    const own = await start(a, { title: 'Alpha only' })
    const all = await start(a, { title: 'Open to all', visibility: 'everyone' })
    const ids = async u => (await as(u, 'get', '/api/meetups?limit=50')).body.map(m => m._id)
    expect(await ids(b)).toEqual(expect.arrayContaining([own._id, all._id]))
    expect(await ids(c)).toContain(all._id)
    expect(await ids(c)).not.toContain(own._id)
    expect((await as(c, 'get', `/api/meetups/${own._id}`)).status).toBe(404)
    expect((await as(c, 'post', `/api/meetups/${own._id}/join`)).status).toBe(404)

    await User.updateOne({ _id: a._id }, { $push: { blockedUsers: c._id } })
    expect(await ids(c)).not.toContain(all._id)
    expect((await as(c, 'get', `/api/meetups/${all._id}`)).status).toBe(404)
  })

  test('details: creator, members (name, avatar, college), remaining time; never a position', async () => {
    const a = await makeUser({ avatar: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/a.jpg' })
    const b = await makeUser()
    const m = await start(a, { description: 'Bring a bat' })
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    const d = await as(b, 'get', `/api/meetups/${m._id}`)
    expect(d.status).toBe(200)
    expect(d.body).toMatchObject({ title: 'Cricket after class', description: 'Bring a bat', location: 'Main ground', memberCount: 2, joined: true, isCreator: false })
    expect(d.body.creator).toMatchObject({ _id: String(a._id), name: a.name, college: 'Test College' })
    expect(d.body.members.map(x => x._id)).toEqual([String(a._id), String(b._id)])
    expect(d.body.members[0]).toMatchObject({ isCreator: true, avatar: a.avatar, college: 'Test College', year: '2nd' })
    expect(JSON.stringify(d.body)).not.toMatch(/email|password|coordinates|latitude/i)
  })
})

// ───────────────────────────────── join / leave / end
describe('membership', () => {
  test('join is idempotent, also under 10 parallel requests', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    const results = await Promise.all(Array.from({ length: 10 }, () => as(b, 'post', `/api/meetups/${m._id}/join`)))
    expect(results.every(r => r.status === 200)).toBe(true)
    expect(results.filter(r => !r.body.alreadyJoined)).toHaveLength(1)
    expect(await MeetupMember.countDocuments({ meetup: m._id })).toBe(2)
    expect((await Meetup.findById(m._id)).memberCount).toBe(2)
  })

  test('chat is for members only', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    expect((await as(b, 'get', `/api/meetups/${m._id}/messages`)).status).toBe(403)
    expect((await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'hi' })).status).toBe(403)
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    const sent = await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text: '  hi all  ' })
    expect(sent.status).toBe(201)
    expect(sent.body).toMatchObject({ kind: 'text', text: 'hi all', sender: { _id: String(b._id), name: b.name } })
    const msgs = (await as(a, 'get', `/api/meetups/${m._id}/messages`)).body
    expect(msgs.map(x => x.text)).toEqual([`${a.name} started this MeetNow`, `${b.name} joined`, 'hi all'])
    for (const text of ['', '   ', 'x'.repeat(1001), 'you idiot fuck']) {
      expect((await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text })).status).toBe(400)
    }
  })

  test('catching up: ?after= returns only what came since, oldest first', async () => {
    const a = await makeUser()
    const m = await start(a)
    const first = (await as(a, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'one' })).body
    await new Promise(r => setTimeout(r, 5))
    await as(a, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'two' })
    await as(a, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'three' })
    const since = (await as(a, 'get', `/api/meetups/${m._id}/messages?after=${encodeURIComponent(first.createdAt)}`)).body
    expect(since.map(x => x.text)).toEqual(['two', 'three'])
  })

  test('the creator leaving keeps it alive; the last member leaving deletes it', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    const left = await as(a, 'post', `/api/meetups/${m._id}/leave`)
    expect(left.body).toEqual({ left: true, ended: false })
    expect((await as(b, 'get', `/api/meetups/${m._id}`)).body.memberCount).toBe(1)
    const last = await as(b, 'post', `/api/meetups/${m._id}/leave`)
    expect(last.body).toEqual({ left: true, ended: true })
    await expectDeleted(m._id)
  })

  test('"until I leave": the creator leaving ends it for everyone', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a, { duration: 'until_leave' })
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    expect((await as(a, 'post', `/api/meetups/${m._id}/leave`)).body).toEqual({ left: true, ended: true })
    await expectDeleted(m._id)
    expect((await as(b, 'get', `/api/meetups/${m._id}/messages`)).status).toBe(404)
  })

  test('only the creator can end it; ending deletes everything at once', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'see you there' })
    expect((await as(b, 'delete', `/api/meetups/${m._id}`)).status).toBe(403)
    expect((await as(a, 'delete', `/api/meetups/${m._id}`)).body).toEqual({ ended: true })
    await expectDeleted(m._id)
    for (const [method, url] of [['get', ''], ['get', '/messages'], ['post', '/join'], ['post', '/messages'], ['post', '/leave'], ['delete', '']]) {
      const res = await as(a, method, `/api/meetups/${m._id}${url}`).send({ text: 'x' })
      expect(res.status).toBe(404)
    }
    expect((await as(b, 'get', '/api/meetups')).body.map(x => x._id)).not.toContain(m._id)
  })
})

async function expectDeleted(id) {
  expect(await Meetup.countDocuments({ _id: id })).toBe(0)
  expect(await MeetupMember.countDocuments({ meetup: id })).toBe(0)
  expect(await MeetupMessage.countDocuments({ meetup: id })).toBe(0)
}

// ───────────────────────────────── expiry
describe('expiry', () => {
  test('one second after expiry nothing is reachable, even before anything is deleted', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    await expire(m._id)
    expect(await Meetup.countDocuments({ _id: m._id })).toBe(1)   // still stored…
    for (const [method, url] of [['get', ''], ['get', '/messages'], ['post', '/join'], ['post', '/messages'], ['post', '/leave'], ['delete', ''], ['post', '/report']]) {
      expect((await as(b, method, `/api/meetups/${m._id}${url}`).send({ text: 'x', reason: 'spam' })).status).toBe(404)   // …but gone
    }
    expect((await as(b, 'get', '/api/meetups')).body.map(x => x._id)).not.toContain(m._id)
  })

  test('the sweeper deletes expired meetups with all members and messages, and orphans', async () => {
    const a = await makeUser()
    const keep = await start(a)
    const old = await start(a)
    await expire(old._id)
    // rows left behind by a meetup MongoDB's TTL already removed
    const ghost = new mongoose.Types.ObjectId()
    const later = new Date(Date.now() + 3600e3)
    await MeetupMessage.create({ meetup: ghost, sender: a._id, text: 'orphan', expiresAt: later })
    await MeetupMember.create({ meetup: ghost, user: a._id, expiresAt: later })
    expect(await life.sweep()).toBeGreaterThanOrEqual(1)
    await expectDeleted(old._id)
    await expectDeleted(ghost)
    expect(await Meetup.countDocuments({ _id: keep._id })).toBe(1)
    expect(await MeetupMessage.countDocuments({ meetup: keep._id })).toBe(1)
  })

  test('a meetup ending before the next sweep is ended at its exact second, with the event', async () => {
    const a = await makeUser()
    const m = await start(a)
    const end = new Date(Date.now() + 1500)
    await Meetup.updateOne({ _id: m._id }, { expiresAt: end })
    const ended = jest.spyOn(realtime, 'meetupEnded')
    expect(await life.scheduleUpcoming(60_000)).toBeGreaterThanOrEqual(1)
    await new Promise(r => setTimeout(r, 2200))
    expect(ended).toHaveBeenCalledWith(expect.objectContaining({ title: m.title }), 'expired')
    await expectDeleted(m._id)
    ended.mockRestore()
    life.stopSweeper()
  })

  test('TTL indexes back the sweeper up on all three collections', async () => {
    for (const model of [Meetup, MeetupMember, MeetupMessage]) {
      const ttl = (await model.collection.indexes()).find(i => i.key.expiresAt === 1)
      expect(ttl).toMatchObject({ expireAfterSeconds: 0 })
    }
  })
})

// ───────────────────────────────── reports
describe('reports keep a 90-day snapshot', () => {
  test('meetup and message reports; the snapshot outlives the meetup and expires after 90 days', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a, { title: 'Spammy meetup', description: 'buy now' })
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    const msg = (await as(a, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'rude words here' })).body

    expect((await as(b, 'post', `/api/meetups/${m._id}/report`).send({ reason: 'spam' })).status).toBe(200)
    expect((await as(b, 'post', `/api/meetups/${m._id}/report`).send({ reason: 'spam' })).status).toBe(400)
    expect((await as(a, 'post', `/api/meetups/${m._id}/report`).send({ reason: 'spam' })).status).toBe(400)
    expect((await as(b, 'post', `/api/meetups/${m._id}/messages/${msg._id}/report`).send({ reason: 'harassment', note: 'not ok' })).status).toBe(200)
    expect((await as(a, 'post', `/api/meetups/${m._id}/messages/${msg._id}/report`).send({ reason: 'spam' })).status).toBe(400)

    await as(a, 'delete', `/api/meetups/${m._id}`)
    const reports = await Report.find({ reportedBy: b._id }).sort({ targetType: 1 }).lean()
    expect(reports.map(r => r.targetType)).toEqual(['meetup', 'meetup_message'])
    expect(reports[0].snapshot).toMatchObject({ title: 'Spammy meetup', text: 'buy now', senderName: a.name })
    expect(reports[1].snapshot).toMatchObject({ text: 'rude words here', senderName: a.name })
    for (const r of reports) {
      expect((r.expiresAt - r.createdAt) / 864e5).toBeCloseTo(90, 1)
    }

    // the admin sees them
    const admin = await User.findOne({ email: process.env.ADMIN_EMAIL }) || await makeUser({ email: process.env.ADMIN_EMAIL })
    const list = await as(admin, 'get', '/api/posts/admin/reports').set('x-admin-key', 'test-admin-key')
    const mine = list.body.filter(r => String(r.reportedBy?._id) === String(b._id))
    expect(mine.map(r => r.targetType).sort()).toEqual(['meetup', 'meetup_message'])
    expect(mine.find(r => r.targetType === 'meetup_message').snapshot.text).toBe('rude words here')
  })
})

// ───────────────────────────────── account deletion
describe('account deletion', () => {
  test('their meetups end, their memberships and messages go, reports quoting them go', async () => {
    const gone = await makeUser()
    const other = await makeUser()
    const theirs = await start(gone)
    const others = await start(other)
    await as(other, 'post', `/api/meetups/${theirs._id}/join`)
    await as(gone, 'post', `/api/meetups/${others._id}/join`)
    await as(gone, 'post', `/api/meetups/${others._id}/messages`).send({ text: 'my message' })
    const msg = await MeetupMessage.findOne({ meetup: others._id, sender: gone._id, kind: 'text' })
    await as(other, 'post', `/api/meetups/${others._id}/messages/${msg._id}/report`).send({ reason: 'spam' })

    expect((await as(gone, 'delete', '/api/users/me').send({ password: PASSWORD })).status).toBe(204)
    await expectDeleted(theirs._id)
    expect(await MeetupMember.countDocuments({ user: gone._id })).toBe(0)
    expect(await MeetupMessage.countDocuments({ sender: gone._id })).toBe(0)
    expect((await Meetup.findById(others._id)).memberCount).toBe(1)
    expect(await Report.countDocuments({ 'snapshot.sender': gone._id })).toBe(0)
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
  const next = (s, event) => new Promise(resolve => s.once(event, resolve))
  const emit = (s, event, payload) => new Promise(resolve => s.emit(event, payload, resolve))

  test('handshake: a bad token, an old session, or no feature is refused', async () => {
    const u = await makeUser()
    await expect(open('nope')).rejects.toThrow('unauthorized')
    const old = signToken(u)
    await User.updateOne({ _id: u._id }, { $inc: { tokenVersion: 1 } })
    await expect(open(old)).rejects.toThrow('unauthorized')
    process.env.FEATURE_MEETNOW = 'off'
    await expect(open(signToken(await User.findById(u._id)))).rejects.toThrow('not_available')
  })

  test('members get messages, joins and the end; non-members cannot subscribe', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const c = await makeUser()
    const m = await start(a)
    const sa = await open(signToken(a))
    const sc = await open(signToken(c))
    expect(await emit(sa, 'meetup:subscribe', { meetupId: m._id })).toEqual({ ok: true })
    expect(await emit(sc, 'meetup:subscribe', { meetupId: m._id })).toEqual({ ok: false, code: 'NOT_A_MEMBER' })
    expect(await emit(sc, 'meetnow:watch')).toEqual({ ok: true })

    const counted = next(sc, 'meetup:members')
    const joinedLine = next(sa, 'meetup:message')
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    expect(await counted).toMatchObject({ meetupId: m._id, memberCount: 2, joined: { _id: String(b._id) } })
    expect(await joinedLine).toMatchObject({ kind: 'system', text: `${b.name} joined` })

    const got = next(sa, 'meetup:message')
    await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'on my way' })
    expect(await got).toMatchObject({ kind: 'text', text: 'on my way', sender: { _id: String(b._id) } })

    const endedA = next(sa, 'meetup:ended')
    const endedC = next(sc, 'meetup:ended')
    await as(a, 'delete', `/api/meetups/${m._id}`)
    expect(await endedA).toEqual({ meetupId: m._id, reason: 'ended' })
    expect(await endedC).toEqual({ meetupId: m._id, reason: 'ended' })
    expect(await emit(sa, 'meetup:subscribe', { meetupId: m._id })).toEqual({ ok: false, code: 'MEETUP_NOT_FOUND' })
  })

  test('a blocked sender\'s messages arrive without text', async () => {
    const a = await makeUser()
    const b = await makeUser()
    const m = await start(a)
    await as(b, 'post', `/api/meetups/${m._id}/join`)
    await User.updateOne({ _id: a._id }, { $push: { blockedUsers: b._id } })
    const sa = await open(signToken(await User.findById(a._id)))
    await emit(sa, 'meetup:subscribe', { meetupId: m._id })
    const got = next(sa, 'meetup:message')
    await as(b, 'post', `/api/meetups/${m._id}/messages`).send({ text: 'secret' })
    expect(await got).toMatchObject({ text: null, hidden: true })
    const history = (await as(await User.findById(a._id), 'get', `/api/meetups/${m._id}/messages`)).body
    expect(history.at(-1)).toMatchObject({ text: null, hidden: true })
  })

  test('logging out everywhere drops the live connection', async () => {
    const u = await makeUser()
    const s = await open(signToken(u))
    const dropped = next(s, 'disconnect')
    await as(u, 'post', '/api/auth/logout-all')
    expect(await dropped).toBe('io server disconnect')
  })
})
