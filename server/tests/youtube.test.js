// YouTube links on posts: watch, youtu.be, embed, Shorts and live links on youtube.com,
// www., m. and music. hosts. The same cases are tested in nexusnetwork/src/utils/youtube.test.js
// and mobile/src/lib/__tests__/youtube.test.ts.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // email verification is covered elsewhere

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const { signToken } = require('../utils/token')
const { extractYoutubeId } = require('../utils/youtube')

const ID = 'dQw4w9WgXcQ'

describe('extractYoutubeId', () => {
  test.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}&t=42s`],
    [`https://www.youtube.com/watch?feature=share&v=${ID}`],
    [`https://youtu.be/${ID}?si=abc123`],
    [`http://youtu.be/${ID}`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/shorts/${ID}`],
    [`https://www.youtube.com/live/${ID}?si=abc123`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/shorts/${ID}`],
    [`https://music.youtube.com/watch?v=${ID}&list=RDAMVM${ID}`],
    [`youtube.com/watch?v=${ID}`],
    [`HTTPS://WWW.YOUTUBE.COM/SHORTS/${ID}`],
    [`  https://youtu.be/${ID}  `],
  ])('%s', (url) => {
    expect(extractYoutubeId(url)).toBe(ID)
  })

  test('ids keep their case and may contain - and _', () => {
    expect(extractYoutubeId('https://youtu.be/a_b-C1d2E3f')).toBe('a_b-C1d2E3f')
  })

  test.each([
    ['https://www.youtube.com/@somechannel'],
    ['https://www.youtube.com/playlist?list=PL1234567890'],
    ['https://www.youtube.com/watch?v=short'],
    [`https://youtu.be/${ID}extra`],
    ['https://vimeo.com/123456789'],
    [`https://notyoutube.com/watch?v=${ID}`],
    [`https://youtube.com.evil.example/watch?v=${ID}`],
    [`https://evil.example/?u=https://youtube.com/watch?v=${ID}`],
    [''],
  ])('refuses %s', (url) => {
    expect(extractYoutubeId(url)).toBe('')
  })

  test('anything that is not text gives no id', () => {
    expect(extractYoutubeId(null)).toBe('')
    expect(extractYoutubeId(42)).toBe('')
    expect(extractYoutubeId({ url: `https://youtu.be/${ID}` })).toBe('')
  })
})

describe('POST /api/posts with YouTube links', () => {
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

  function makeUser() {
    const n = crypto.randomBytes(4).toString('hex')
    return User.create({
      name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`,
      password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS',
    })
  }
  const createPost = (user, body) => request(app).post('/api/posts')
    .set('Authorization', `Bearer ${signToken(user)}`)
    .send({ type: 'social', text: 'Watch this one', ...body })

  test.each([
    [`https://youtube.com/shorts/${ID}?feature=share`],
    [`https://www.youtube.com/live/${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://music.youtube.com/watch?v=${ID}`],
  ])('%s is saved with its video id', async (youtubeUrl) => {
    const user = await makeUser()
    const res = await createPost(user, { youtubeUrl })
    expect(res.status).toBe(201)
    const saved = await Post.findById(res.body._id).lean()
    expect(saved.youtubeUrl).toBe(youtubeUrl)
    expect(saved.youtubeId).toBe(ID)
  })

  test('a Shorts link and an image together are refused, like any other video', async () => {
    const user = await makeUser()
    const res = await createPost(user, {
      youtubeUrl: `https://youtube.com/shorts/${ID}`,
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/x.jpg',
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Choose either image or YouTube video')
  })
})
