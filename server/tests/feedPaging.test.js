// Feed paging (GET /api/posts): the cursor (`before`) never repeats or skips a post when posts are
// created or deleted between two pages, has a total order (createdAt, _id), and leaves the page mode
// that existing clients use (server/API_MOBILE.md) as it was.
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
const { signToken } = require('../utils/token')
const { encodeCursor, parseCursor } = require('../utils/feedCursor')

let mongo
function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({
    name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`, password: 'secret123',
    college: 'Test College', year: '2nd', branch: 'CS', ...overrides,
  })
}
const as = (user, url) => request(app).get(url).set('Authorization', `Bearer ${signToken(user)}`)
const BASE = Date.UTC(2026, 10, 18, 12, 0, 0)
// n posts by `author`, "T01" newest … one minute apart, starting `offsetMin` minutes before BASE
async function makePosts(author, n, { offsetMin = 0, prefix = 'T', extra = {} } = {}) {
  const docs = []
  for (let i = 1; i <= n; i++) {
    docs.push({ type: 'social', text: `${prefix}${String(i).padStart(2, '0')} post`, postedBy: author._id, college: author.college,
      createdAt: new Date(BASE - (offsetMin + i) * 60000), ...extra })
  }
  return Post.insertMany(docs)
}
const tags = list => list.map(p => p.text.split(' ')[0])
const dupes = list => list.filter((x, i) => list.indexOf(x) !== i)
const cursorOf = list => encodeCursor(list.at(-1))

// Walks the feed: first page in page mode (like the web app), then by cursor from the oldest post seen
async function walk(viewer, query, limit, between = async () => {}) {
  const first = (await as(viewer, `/api/posts?${query}&limit=${limit}`)).body
  const seen = [...first]
  let oldest = [...first].sort((a, b) => (a.createdAt === b.createdAt ? (a._id < b._id ? -1 : 1) : (a.createdAt < b.createdAt ? -1 : 1)))[0]
  let rounds = 0
  while (oldest && rounds++ < 50) {
    await between(rounds, seen)
    const res = await as(viewer, `/api/posts?${query}&limit=${limit}&before=${encodeURIComponent(encodeCursor(oldest))}`)
    expect(res.status).toBe(200)
    seen.push(...res.body)
    if (res.body.length < limit) break
    oldest = res.body.at(-1)
  }
  return seen
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await Promise.all([User.init(), Post.init()])
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
beforeEach(async () => { await Post.deleteMany({}) })

describe('cursor paging', () => {
  test('walks the whole feed once: no duplicates, no gaps, newest first', async () => {
    const viewer = await makeUser(); const author = await makeUser()
    await makePosts(author, 45)
    const seen = await walk(viewer, 'global=true', 20)
    expect(seen).toHaveLength(45)
    expect(dupes(tags(seen))).toEqual([])
    // the cursor pages come back in the stable feed order (not re-ranked)
    const second = (await as(viewer, `/api/posts?global=true&limit=20&before=${encodeURIComponent(encodeCursor({ createdAt: new Date(BASE - 20 * 60000), _id: '000000000000000000000000' }))}`)).body
    expect(tags(second)).toEqual(Array.from({ length: 20 }, (_, i) => `T${String(i + 21).padStart(2, '0')}`))
  })

  test('new posts created between pages: nothing repeats, nothing is skipped', async () => {
    const viewer = await makeUser(); const author = await makeUser()
    await makePosts(author, 50)
    const seen = await walk(viewer, 'global=true', 20, async round => {
      // 3 new posts arrive before each next page (with skip/limit these pushed page 1's tail onto page 2)
      await makePosts(author, 3, { offsetMin: -1000 - round * 10, prefix: `N${round}-` })
    })
    const old = tags(seen).filter(t => t.startsWith('T'))
    expect(dupes(tags(seen))).toEqual([])
    expect(old).toHaveLength(50)
    expect(tags(seen).filter(t => t.startsWith('N'))).toEqual([])   // new posts are for the "New posts" pill, not the tail
  })

  test('posts deleted between pages: nothing is skipped', async () => {
    const viewer = await makeUser(); const author = await makeUser()
    await makePosts(author, 50)
    const deleted = []
    const seen = await walk(viewer, 'global=true', 20, async (round, sofar) => {
      if (round !== 1) return
      // the author deletes 3 posts the viewer already has (with skip/limit, 3 later posts were never shown)
      const gone = sofar.slice(0, 3)
      deleted.push(...tags(gone))
      await Post.deleteMany({ _id: { $in: gone.map(p => p._id) } })
    })
    expect(dupes(tags(seen))).toEqual([])
    expect(seen).toHaveLength(50)   // all 50: the 3 deleted ones had been shown before they were deleted
    expect(deleted).toHaveLength(3)
  })

  test('posts with the same createdAt are split across pages without loss (tie-break on _id)', async () => {
    const viewer = await makeUser(); const author = await makeUser()
    await makePosts(author, 7, { extra: { createdAt: new Date(BASE) } })
    const seen = await walk(viewer, 'global=true', 3)
    expect(seen).toHaveLength(7)
    expect(dupes(seen.map(p => p._id))).toEqual([])
  })

  test('the skip/limit page mode is unchanged for existing clients (and shows the problem)', async () => {
    const viewer = await makeUser(); const author = await makeUser()
    await makePosts(author, 45)
    const p1 = (await as(viewer, '/api/posts?global=true&page=1&limit=20')).body
    await makePosts(author, 3, { offsetMin: -100, prefix: 'N' })
    const p2 = (await as(viewer, '/api/posts?global=true&page=2&limit=20')).body
    expect(p1).toHaveLength(20)
    expect(p2).toHaveLength(20)
    // page 2 repeats the last 3 posts of page 1: why the web app moved to the cursor
    expect(p2.filter(p => p1.some(x => x._id === p._id))).toHaveLength(3)
  })

  test('works for the college feed, a type filter and the Following feed', async () => {
    const viewer = await makeUser(); const author = await makeUser(); const other = await makeUser({ college: 'Elsewhere' })
    await makePosts(author, 25)
    await makePosts(author, 6, { offsetMin: 100, prefix: 'Q', extra: { type: 'qa' } })
    await makePosts(other, 10, { prefix: 'O' })
    await User.updateOne({ _id: viewer._id }, { $set: { following: [author._id] } })

    const college = await walk(viewer, 'global=false', 10)
    expect(college).toHaveLength(31)
    expect(tags(college).some(t => t.startsWith('O'))).toBe(false)

    const qa = await walk(viewer, 'type=qa&global=true', 4)
    expect(tags(qa).sort()).toEqual(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06'])
    expect(qa).toHaveLength(6)

    const following = await walk(viewer, 'connections=true', 10)
    expect(following).toHaveLength(31)
    expect(dupes(tags(following))).toEqual([])
  })

  test('an invalid cursor is a 400', async () => {
    const viewer = await makeUser()
    for (const bad of ['', 'abc', '2026-11-18T00:00:00.000Z', 'nope_6afdcc035d1bfd511ec42f6e', '2026-11-18T00:00:00.000Z_xyz']) {
      const res = await as(viewer, `/api/posts?global=true&before=${encodeURIComponent(bad)}`)
      expect(res.status).toBe(400)
      expect(res.body.message).toBe('Invalid cursor')
    }
  })

  test('cursor format round-trips', () => {
    const id = new mongoose.Types.ObjectId()
    const c = parseCursor(encodeCursor({ createdAt: new Date(BASE), _id: id }))
    expect(c.createdAt.getTime()).toBe(BASE)
    expect(String(c.id)).toBe(String(id))
  })
})
