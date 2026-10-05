// Security regression tests: data leaks on public endpoints + login rate limiting.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // these suites predate email verification

const request  = require('supertest')
const mongoose = require('mongoose')
const jwt      = require('jsonwebtoken')
const bcrypt   = require('bcryptjs')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const Notification = require('../models/Notification')

let mongo, author, viewer, viewerToken

function makeUser(overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8)
  return User.create({
    name: `User ${n}`, username: `user_${n}`, email: `${n}@college.edu`,
    password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS',
    ...overrides,
  })
}

// Recursively look for a key anywhere in a JSON payload
function containsKey(obj, key) {
  if (!obj || typeof obj !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(obj, key)) return true
  return Object.values(obj).some(v => containsKey(v, key))
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  author = await makeUser({ email: 'author@college.edu' })
  viewer = await makeUser({ email: 'viewer@college.edu' })
  await User.findByIdAndUpdate(author._id, { $addToSet: { followers: viewer._id } })
  viewerToken = jwt.sign({ id: viewer._id }, process.env.JWT_SECRET)
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

describe('GET /api/posts/:id', () => {
  test('never contains password or email (author or replies)', async () => {
    const post = await Post.create({
      type: 'social', text: 'hello public world', postedBy: author._id,
      college: 'Test College',
      replies: [{ text: 'nice post', postedBy: viewer._id }],
    })

    const res = await request(app).get(`/api/posts/${post._id}`)

    expect(res.status).toBe(200)
    expect(containsKey(res.body, 'password')).toBe(false)
    expect(containsKey(res.body, 'email')).toBe(false)
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/) // no bcrypt hash anywhere
    expect(Object.keys(res.body.postedBy).sort()).toEqual(
      ['_id', 'avatar', 'branch', 'college', 'isContributor', 'name', 'username', 'year'].sort()
    )
    expect(Object.keys(res.body.replies[0].postedBy).sort()).toEqual(
      ['_id', 'avatar', 'branch', 'name', 'year'].sort()
    )
  })

  test('anonymous post returns postedBy null', async () => {
    const post = await Post.create({
      type: 'confession', text: 'secret confession', isAnonymous: true,
      postedBy: author._id, college: 'Test College',
    })

    const res = await request(app).get(`/api/posts/${post._id}`)

    expect(res.status).toBe(200)
    expect(res.body.postedBy).toBeNull()
    expect(JSON.stringify(res.body)).not.toContain(author._id.toString())
  })

  test('expired post returns 404', async () => {
    const post = await Post.create({
      type: 'social', text: 'today only post', postedBy: author._id,
      college: 'Test College', expiresAt: new Date(Date.now() - 1000),
    })
    const res = await request(app).get(`/api/posts/${post._id}`)
    expect(res.status).toBe(404)
  })

  test('invalid id returns 400', async () => {
    const res = await request(app).get('/api/posts/not-an-id')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/users/:id', () => {
  test('has no email or password', async () => {
    const res = await request(app)
      .get(`/api/users/${author._id}`)
      .set('Authorization', `Bearer ${viewerToken}`)

    expect(res.status).toBe(200)
    expect(res.body.name).toBe(author.name)
    expect(res.body).not.toHaveProperty('email')
    expect(res.body).not.toHaveProperty('password')
  })

  test('/me still returns own email', async () => {
    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${viewerToken}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('viewer@college.edu')
    expect(res.body).not.toHaveProperty('password')
  })
})

describe('User model', () => {
  test('password is not selected by default but login still works', async () => {
    const found = await User.findById(author._id).lean()
    expect(found).not.toHaveProperty('password')

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'author@college.edu', password: 'secret123' })
    expect(res.status).toBe(200)
    expect(res.body.user.email).toBe('author@college.edu')
    expect(res.body.user).not.toHaveProperty('password')
  })

  test('bcrypt failure aborts the save instead of storing plaintext', async () => {
    const spy = jest.spyOn(bcrypt, 'hash').mockRejectedValueOnce(new Error('hash failed'))
    await expect(makeUser({ email: 'plain@college.edu' })).rejects.toThrow('hash failed')
    spy.mockRestore()
    expect(await User.findOne({ email: 'plain@college.edu' })).toBeNull()
  })
})

describe('login rate limiter', () => {
  const login = email => request(app).post('/api/auth/login').send({ email, password: 'wrong-password' })

  test('keys by IP + email: one account is locked, others on the same IP are not', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login('victim@college.edu')
      expect(res.status).toBe(400)
    }

    // 11th attempt for the same account (case/whitespace-normalized) is blocked
    const blocked = await login('  VICTIM@college.edu ')
    expect(blocked.status).toBe(429)
    expect(blocked.body).toEqual({ message: expect.any(String) })
    expect(blocked.headers.ratelimit).toBeDefined()
    expect(blocked.headers['ratelimit-policy']).toBeDefined()

    // A different student behind the same IP is unaffected
    const other = await login('classmate@college.edu')
    expect(other.status).toBe(400)
    expect(other.headers.ratelimit).toMatch(/remaining=9/)
  })
})

describe('anonymous post de-anonymisation', () => {
  let anonAuthor, other, authorToken, otherToken, authorId
  let anonPost, anonProject, publicPost

  const as = (token, method, url) =>
    request(app)[method](url).set('Authorization', `Bearer ${token}`)

  // The author's id must not appear anywhere in a payload other users receive
  function expectNoAuthorId(body) {
    expect(JSON.stringify(body)).not.toContain(authorId)
  }

  // Shape every anonymous-post response must have
  function expectSanitizedAnon(post) {
    expect(post.postedBy).toBeNull()
    expect(post.likes.map(String)).not.toContain(authorId)
    expect(post.likeCount).toBe(2)                // author self-like + other's like
    const authorReply = post.replies.find(r => r.text === 'author here')
    expect(authorReply).toMatchObject({ postedBy: null, isAuthor: true })
    const otherReply = post.replies.find(r => r.text === 'outsider reply')
    expect(otherReply.postedBy._id).toBe(other._id.toString())
    expect(otherReply).not.toHaveProperty('isAuthor')
  }

  beforeAll(async () => {
    anonAuthor  = await makeUser({ email: 'anon-author@college.edu' })
    other       = await makeUser({ email: 'other@college.edu' })
    authorId    = anonAuthor._id.toString()
    authorToken = jwt.sign({ id: anonAuthor._id }, process.env.JWT_SECRET)
    otherToken  = jwt.sign({ id: other._id },      process.env.JWT_SECRET)
    await User.findByIdAndUpdate(other._id, { $addToSet: { following: anonAuthor._id } })

    // Everything goes through the real API so notifications are created as in prod
    anonPost = (await as(authorToken, 'post', '/api/posts')
      .send({ type: 'confession', text: 'anonymous confession', isAnonymous: true })).body
    anonProject = (await as(authorToken, 'post', '/api/posts')
      .send({ type: 'project', text: 'anonymous project idea', isAnonymous: true })).body
    publicPost = (await as(authorToken, 'post', '/api/posts')
      .send({ type: 'social', text: 'signed public post' })).body

    await as(authorToken, 'put',  `/api/posts/${anonPost._id}/like`)          // self-like
    await as(otherToken,  'put',  `/api/posts/${anonPost._id}/like`)
    await as(otherToken,  'post', `/api/posts/${anonPost._id}/replies`).send({ text: 'outsider reply' })
    await as(authorToken, 'post', `/api/posts/${anonPost._id}/replies`).send({ text: 'author here' })
    await as(authorToken, 'post', `/api/posts/${publicPost._id}/replies`).send({ text: 'signed reply' })
    await as(otherToken,  'put',  `/api/posts/${anonPost._id}/save`)
    await as(otherToken,  'post', `/api/posts/${anonProject._id}/interested`)
    await as(authorToken, 'put',  `/api/posts/${anonProject._id}/like`)
    await as(authorToken, 'post', `/api/posts/${anonProject._id}/replies`).send({ text: 'author on project' })
  })

  test('create response hides the author', () => {
    expect(anonPost.postedBy).toBeNull()
    expectNoAuthorId(anonPost)
  })

  test('connections feed leaves anonymous posts out entirely', async () => {
    const res = await as(otherToken, 'get', '/api/posts?connections=true')
    expect(res.status).toBe(200)
    expect(res.body.map(p => p._id)).not.toContain(anonPost._id)
    expectNoAuthorId(res.body.filter(p => p.isAnonymous))
  })

  test.each([
    ['college feed',     '/api/posts'],
    ['global feed',      '/api/posts?global=true'],
    ['saved posts',      '/api/users/me/saved'],
  ])('%s: author reply/like hidden from other users', async (_, url) => {
    const res = await as(otherToken, 'get', url)
    expect(res.status).toBe(200)
    const post = res.body.find(p => p._id === anonPost._id)
    expect(post).toBeDefined()
    expectSanitizedAnon(post)
    expect(post.likedByMe).toBe(true)
    expectNoAuthorId(res.body.filter(p => p.isAnonymous))
  })

  test('GET /api/posts/:id (public, no viewer)', async () => {
    const res = await request(app).get(`/api/posts/${anonPost._id}`)
    expect(res.status).toBe(200)
    expectSanitizedAnon(res.body)
    expect(res.body).not.toHaveProperty('likedByMe')
    expect(res.body.replies.find(r => r.isAuthor)).not.toHaveProperty('isMine')
    expectNoAuthorId(res.body)
  })

  test('GET /api/users/me/posts: author still sees own like and can delete own reply', async () => {
    const res = await as(authorToken, 'get', '/api/users/me/posts')
    expect(res.status).toBe(200)
    const post = res.body.find(p => p._id === anonPost._id)
    expectSanitizedAnon(post)
    expect(post.likedByMe).toBe(true)
    expect(post.replies.find(r => r.isAuthor).isMine).toBe(true)
  })

  test('GET /api/users/:id/posts: signed posts keep reply authors (isAuthor only on anonymous)', async () => {
    const res = await as(otherToken, 'get', `/api/users/${authorId}/posts`)
    expect(res.status).toBe(200)
    expect(res.body.map(p => p._id)).toEqual([publicPost._id])   // anonymous posts excluded
    const reply = res.body[0].replies.find(r => r.text === 'signed reply')
    expect(reply.postedBy._id).toBe(authorId)
    expect(reply).not.toHaveProperty('isAuthor')
    expect(res.body[0].likeCount).toBe(0)
  })

  test('POST /api/posts/:id/replies response hides the author on anonymous posts', async () => {
    const mine = await as(authorToken, 'post', `/api/posts/${anonPost._id}/replies`).send({ text: 'author again' })
    expect(mine.status).toBe(201)
    expect(mine.body).toMatchObject({ text: 'author again', postedBy: null, isAuthor: true, isMine: true })

    const theirs = await as(otherToken, 'post', `/api/posts/${anonPost._id}/replies`).send({ text: 'outsider again' })
    expect(theirs.body.postedBy._id).toBe(other._id.toString())
    expect(theirs.body).not.toHaveProperty('isAuthor')
  })

  test('PUT /api/posts/:id/like response never includes the author id', async () => {
    // Other user toggles off then on; the author's self-like stays hidden throughout
    const off = await as(otherToken, 'put', `/api/posts/${anonPost._id}/like`)
    expect(off.body).toMatchObject({ liked: false, count: 1, likeCount: 1, likes: [] })
    const on = await as(otherToken, 'put', `/api/posts/${anonPost._id}/like`)
    expect(on.body).toMatchObject({ liked: true, count: 2, likeCount: 2, likes: [other._id.toString()] })

    const self = await as(authorToken, 'put', `/api/posts/${anonProject._id}/like`) // unlike own
    expect(self.body.likes).toEqual([])
    expectNoAuthorId(self.body)
  })

  test('no notification about an anonymous post names the author as sender', async () => {
    const anonIds = [anonPost._id, anonProject._id]
    const leaked = await Notification.find({ post: { $in: anonIds }, sender: anonAuthor._id })
    expect(leaked).toHaveLength(0)

    // What other users actually receive
    const res = await as(otherToken, 'get', '/api/notifications')
    expect(res.status).toBe(200)
    expectNoAuthorId(res.body.filter(n => anonIds.includes(n.post?._id)))

    // The author is told about interest, but the sender is the interested user
    const toAuthor = await as(authorToken, 'get', '/api/notifications')
    const interest = toAuthor.body.find(n => n.type === 'interested')
    expect(interest.sender._id).toBe(other._id.toString())
  })
})
