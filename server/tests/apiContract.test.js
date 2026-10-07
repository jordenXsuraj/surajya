// API contract fixes: 503 for internal auth errors, 400 (never 500) for bad client input —
// PUT /users/me, uploads and malformed ids on every route that takes one.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // email verification is covered elsewhere
process.env.ADMIN_EMAIL      = 'admin@college.edu'
process.env.ADMIN_SECRET_KEY = 'test-admin-key'
// Cloudinary mode with a stubbed uploader (local-disk uploads: localUploads.test.js)
process.env.CLOUDINARY_CLOUD_NAME  = 'demo'
process.env.CLOUDINARY_API_KEY     = 'test-key'
process.env.CLOUDINARY_API_SECRET  = 'test-secret'
// Where local-disk uploads would go if this suite ever fell back to them (it must not)
process.env.LOCAL_UPLOAD_DIR = require('path').join(require('os').tmpdir(), `meetnet-no-uploads-${process.pid}`)

const crypto   = require('crypto')
const { Writable } = require('stream')
const request  = require('supertest')
const mongoose = require('mongoose')
const jwt      = require('jsonwebtoken')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const { signToken } = require('../utils/token')
const { cloudinary } = require('../config/cloudinary')
const { LOCAL_UPLOAD_DIR } = require('../config/uploadMode')
const fs = require('fs')

let mongo

function makeUser(overrides = {}) {
  const n = crypto.randomBytes(4).toString('hex')
  return User.create({
    name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`,
    password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS', ...overrides,
  })
}
const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`)

// Cloudinary stand-in: swallows the upload stream, then answers like the real uploader
function fakeCloudinary({ error } = {}) {
  jest.spyOn(cloudinary.uploader, 'destroy').mockImplementation((id, opts, cb) => cb?.(undefined, { result: 'ok' }))
  return jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((opts, cb) => new Writable({
    write(chunk, enc, done) { done() },
    final(done) {
      done()
      if (error) cb(error)
      else cb(undefined, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/x.jpg', public_id: 'nexus/x', bytes: 10, format: 'jpg' })
    },
  }))
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  await User.init()
})
afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})
afterEach(() => jest.restoreAllMocks())

// ───────────────────────────────── auth middleware
describe('auth middleware status codes', () => {
  test('an internal error while checking the token is 503 (not 401), with Retry-After', async () => {
    const user = await makeUser()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(User, 'findById').mockImplementation(() => { throw new Error('database unreachable') })

    const res = await as(user, 'get', '/api/users/me')
    expect(res.status).toBe(503)
    expect(res.body.message).toBe('Service temporarily unavailable. Please try again.')
    expect(res.headers['retry-after']).toBe('5')
  })

  test('dead sessions are still 401', async () => {
    const user = await makeUser()
    expect((await request(app).get('/api/users/me')).status).toBe(401)
    expect((await request(app).get('/api/users/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401)
    const expired = jwt.sign({ id: user._id, tv: 0 }, process.env.JWT_SECRET, { expiresIn: -10 })
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${expired}`)
    expect(res.status).toBe(401)
    expect(res.body.message).toBe('Session expired. Please log in again.')
    await User.deleteOne({ _id: user._id })
    expect((await as(user, 'get', '/api/users/me')).status).toBe(401)
  })
})

// ───────────────────────────────── PUT /users/me
describe('PUT /api/users/me validation is 400', () => {
  test.each([
    [{ year: '5th' },                          'Year must be 1st, 2nd, 3rd or 4th'],
    [{ name: 42 },                             'name must be text'],
    [{ bio: { text: 'hi' } },                  'bio must be text'],
    [{ username: ['a'] },                      'username must be text'],
    [{ name: '   ' },                          'Name cannot be empty'],
    [{ name: 'x'.repeat(61) },                 'Name can be at most 60 characters'],
    [{ skills: 'React' },                      'skills must be a list of text'],
    [{ skills: ['React', 3] },                 'skills must be a list of text'],
    [{ projects: 'robot' },                    'projects must be a list'],
    [{ projects: [{ name: 5 }] },              'Each project needs a text name and an optional text link'],
    [{ projects: [{ name: 'p'.repeat(61) }] }, 'Project names can be at most 60 characters'],
    [{ mediaItems: {} },                       'mediaItems must be a list'],
    [{ mediaItems: Array.from({ length: 31 }, () => ({ type: 'youtube', url: 'https://youtu.be/x' })) }, 'At most 30 media items'],
    [{ username: 'ab' },                       'Username too short'],
  ])('%j → %s', async (body, message) => {
    const user = await makeUser()
    const res = await as(user, 'put', '/api/users/me').send(body)
    expect(res.status).toBe(400)
    expect(res.body.message).toBe(message)
  })

  test('a username taken by someone else is 400', async () => {
    const other = await makeUser()
    const user  = await makeUser()
    const res = await as(user, 'put', '/api/users/me').send({ username: other.username })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Username already taken')
  })

  test('schema errors the checks did not catch are 400 too (never 500)', async () => {
    const user = await makeUser()
    const err = new mongoose.Error.ValidationError()
    err.addError('roadmap', new mongoose.Error.ValidatorError({ message: 'Roadmap is too long' }))
    const realUpdate = User.findByIdAndUpdate.bind(User)
    jest.spyOn(User, 'findByIdAndUpdate').mockImplementation((id, update, opts) => {
      if (update?.$set?.roadmap !== undefined) throw err
      return realUpdate(id, update, opts)
    })
    const res = await as(user, 'put', '/api/users/me').send({ roadmap: 'learning' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Roadmap is too long')
  })

  test('valid updates still work', async () => {
    const user = await makeUser()
    const res = await as(user, 'put', '/api/users/me').send({
      name: ' Asha ', year: '3rd', skills: ['React'], projects: [{ name: 'Robot', link: ' https://x.dev ' }],
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ name: 'Asha', year: '3rd', skills: ['React'], projects: [{ name: 'Robot', link: 'https://x.dev' }] })
  })
})

// ───────────────────────────────── uploads
describe('upload errors are 400 with a code', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex')
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))   // errorHandler logs them

  test('wrong image type', async () => {
    const upload = fakeCloudinary()
    const user = await makeUser()
    for (const url of ['/api/users/me/avatar', '/api/users/me/cover', '/api/posts/upload-image']) {
      const res = await as(user, 'post', url).attach('image', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ code: 'INVALID_FILE_TYPE', message: 'Only image files allowed (JPG, PNG, WebP, HEIC)' })
    }
    expect(upload).not.toHaveBeenCalled()
  })

  test('wrong PDF type', async () => {
    fakeCloudinary()
    const user = await makeUser()
    const res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', png, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'INVALID_FILE_TYPE', message: 'Only PDF files allowed' })
  })

  test('image over 5 MB', async () => {
    fakeCloudinary()
    const user = await makeUser()
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 1)
    const res = await as(user, 'post', '/api/posts/upload-image').attach('image', big, { filename: 'big.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'FILE_TOO_LARGE', message: 'Image is too large (max 5 MB)' })
  })

  test('PDF over 10 MB', async () => {
    fakeCloudinary()
    const user = await makeUser()
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1)
    const res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', big, { filename: 'big.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'FILE_TOO_LARGE', message: 'PDF is too large (max 10 MB)' })
  })

  test('a file under the wrong field name', async () => {
    fakeCloudinary()
    const user = await makeUser()
    const res = await as(user, 'post', '/api/users/me/avatar').attach('photo', png, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('LIMIT_UNEXPECTED_FILE')
  })

  test('Cloudinary refusing the file (not really an image) is 400', async () => {
    fakeCloudinary({ error: { message: 'Invalid image file', http_code: 400 } })
    const user = await makeUser()
    const res = await as(user, 'post', '/api/posts/upload-image').attach('image', png, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')
  })

  test('a valid upload still succeeds', async () => {
    fakeCloudinary()
    const user = await makeUser()
    const res = await as(user, 'post', '/api/posts/upload-image').attach('image', png, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(200)
    expect(res.body.url).toMatch(/^https:\/\/res\.cloudinary\.com\//)
  })

  test('with Cloudinary configured nothing is stored on disk or served under /uploads', async () => {
    fakeCloudinary()
    const user = await makeUser()
    await as(user, 'post', '/api/posts/upload-image').attach('image', png, { filename: 'a.png', contentType: 'image/png' })
    await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', Buffer.from('%PDF-1.4\n'), { filename: 'a.pdf', contentType: 'application/pdf' })
    expect(fs.existsSync(LOCAL_UPLOAD_DIR)).toBe(false)
    expect((await request(app).get('/uploads/images/post_1_abcdef.png')).status).toBe(404)
  })
})

// ───────────────────────────────── malformed ids
describe('malformed ids are 400 on every route that takes one', () => {
  const BAD = ['not-an-id', 'aaaaaaaaaaaa', '0123456789abcdef0123456z']
  let user, admin, post

  beforeAll(async () => {
    user  = await makeUser()
    admin = await makeUser({ email: process.env.ADMIN_EMAIL })
    post  = await Post.create({ type: 'social', text: 'hello world', postedBy: user._id, college: 'Test College' })
  })

  const routes = bad => [
    ['post',   `/api/users/${bad}/connect`],
    ['post',   `/api/users/${bad}/accept`],
    ['post',   `/api/users/${bad}/reject`],
    ['post',   `/api/users/${bad}/unfollow`],
    ['get',    `/api/users/${bad}/posts`],
    ['get',    `/api/users/${bad}/connections`],
    ['get',    `/api/users/${bad}/following`],
    ['get',    `/api/users/${bad}/followers`],
    ['get',    `/api/users/${bad}`],
    ['post',   `/api/users/${bad}/block`],
    ['post',   `/api/users/${bad}/unblock`],
    ['post',   `/api/users/${bad}/report`],
    ['put',    `/api/posts/${bad}/like`],
    ['put',    `/api/posts/${bad}/save`],
    ['delete', `/api/posts/${bad}`],
    ['post',   `/api/posts/${bad}/replies`],
    ['delete', `/api/posts/${bad}/replies/${new mongoose.Types.ObjectId()}`],
    ['post',   `/api/posts/${bad}/interested`],
    ['post',   `/api/posts/${bad}/report`],
    ['post',   `/api/posts/${bad}/replies/${new mongoose.Types.ObjectId()}/report`],
    ['get',    `/api/posts/${bad}`],
    ['put',    `/api/notifications/${bad}/read`],
  ]

  test.each(BAD)('id %p', async bad => {
    for (const [method, url] of routes(bad)) {
      const res = await as(user, method, url).send({ reason: 'spam', text: 'a reply' })
      expect({ url, status: res.status, body: res.body }).toEqual({ url, status: 400, body: { message: 'Invalid ID format' } })
    }
  })

  test('malformed second ids (:replyId, admin :reportId/:postId) too', async () => {
    const urls = [
      ['delete', `/api/posts/${post._id}/replies/nope`],
      ['post',   `/api/posts/${post._id}/replies/nope/report`],
    ]
    for (const [method, url] of urls) {
      const res = await as(user, method, url).send({ reason: 'spam' })
      expect({ url, status: res.status }).toEqual({ url, status: 400 })
    }
    const adminCall = (method, url) => as(admin, method, url).set('x-admin-key', process.env.ADMIN_SECRET_KEY)
    expect((await adminCall('post', '/api/posts/admin/dismiss/nope')).status).toBe(400)
    expect((await adminCall('delete', '/api/posts/admin/post/nope')).status).toBe(400)
  })

  test('well-formed ids that do not exist are still 404 (or a no-op), not 400', async () => {
    const ghost = new mongoose.Types.ObjectId()
    expect((await as(user, 'post', `/api/users/${ghost}/accept`)).status).toBe(404)
    expect((await as(user, 'get', `/api/users/${ghost}`)).status).toBe(404)
    expect((await as(user, 'get', `/api/posts/${ghost}`)).status).toBe(404)
    expect((await as(user, 'post', `/api/users/${ghost}/reject`)).status).toBe(200)
    expect((await as(user, 'post', `/api/users/${ghost}/unfollow`)).status).toBe(200)
  })
})
