// Confessions are always anonymous on the server, whatever the request says — and anonymous posts
// never notify followers (the notification text names the author).
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // email verification is covered elsewhere

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app          = require('../index')
const User         = require('../models/User')
const Post         = require('../models/Post')
const Notification = require('../models/Notification')
const { signToken } = require('../utils/token')

let mongo
beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await User.init()
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({
    name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`,
    password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS', ...overrides,
  })
}

// An author with one follower
async function authorWithFollower() {
  const follower = await makeUser()
  const author = await makeUser({ followers: [follower._id] })
  return { author, follower }
}

const createPost = (user, body) => request(app).post('/api/posts')
  .set('Authorization', `Bearer ${signToken(user)}`)
  .send({ text: 'Something I never told anyone', ...body })

// Follower notifications are written in the background after the response
const settle = () => new Promise(r => setTimeout(r, 300))

describe('POST /api/posts — confession anonymity', () => {
  test.each([
    ['isAnonymous: false', { isAnonymous: false }],
    ['isAnonymous missing', {}],
    ['isAnonymous: 0', { isAnonymous: 0 }],
    ['isAnonymous: null', { isAnonymous: null }],
  ])('a confession with %s is saved anonymous and hides the author', async (_label, extra) => {
    const { author, follower } = await authorWithFollower()
    const res = await createPost(author, { type: 'confession', ...extra })
    expect(res.status).toBe(201)
    expect(res.body.isAnonymous).toBe(true)
    expect(res.body.postedBy).toBeNull()

    const saved = await Post.findById(res.body._id).lean()
    expect(saved.isAnonymous).toBe(true)
    expect(String(saved.postedBy)).toBe(String(author._id))   // kept for moderation, never shown

    await settle()
    expect(await Notification.countDocuments({ recipient: follower._id })).toBe(0)
  })

  test('other types keep the choice: anonymous on request', async () => {
    const { author, follower } = await authorWithFollower()
    const res = await createPost(author, { type: 'social', isAnonymous: true })
    expect(res.status).toBe(201)
    expect(res.body.isAnonymous).toBe(true)
    expect(res.body.postedBy).toBeNull()
    await settle()
    expect(await Notification.countDocuments({ recipient: follower._id })).toBe(0)
  })

  test('other types keep the choice: named by default, and followers are notified', async () => {
    const { author, follower } = await authorWithFollower()
    const res = await createPost(author, { type: 'qa', isAnonymous: false })
    expect(res.status).toBe(201)
    expect(res.body.isAnonymous).toBe(false)
    expect(String(res.body.postedBy._id)).toBe(String(author._id))
    await settle()
    const notes = await Notification.find({ recipient: follower._id }).lean()
    expect(notes).toHaveLength(1)
    expect(notes[0].type).toBe('new_post')
  })
})
