// Profanity filter (App Store guideline 1.2): whole words from utils/moderationWords.json are refused
// in posts and replies; ordinary words that merely contain one ("Scunthorpe", "assess") never are.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // email verification is covered elsewhere

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app   = require('../index')
const User  = require('../models/User')
const Post  = require('../models/Post')
const { signToken } = require('../utils/token')
const { hasProfanity, normalise } = require('../utils/moderation')

describe('hasProfanity()', () => {
  test.each([
    'you are a fucking idiot', 'fuuuck this', 'what a b1tch', 'chutiya hai kya', 'SHIT happens',
    'sh1tty notes', 'madarchod', 'you asshole!', 'f.u.c.k? no; FUCK.', 'bhenchod!!', 'a$$hole',
    'Fück', '#bullshit',
  ])('refuses %j', (text) => {
    expect(hasProfanity(text)).toBe(true)
  })

  test.each([
    'Scunthorpe United', 'class assessment tomorrow', 'I passed the test', 'cocktail party',
    'Dickens novel', 'shiitake mushrooms', 'hello world, C++ notes', 'grass is green', 'titanic',
    'assassin creed', 'Sussex', 'pass the bass', 'Hello!!! great post!', '4th year CSE, 100% placement',
    '', null, undefined,
  ])('allows %j', (text) => {
    expect(hasProfanity(text)).toBe(false)
  })

  // Names and words that only CONTAIN a listed word (whole-word, case-insensitive matching)
  test.each([
    'Shital Patil', 'Kshitij Deshmukh', 'Shitanshu', 'Ashita', 'Mishita', 'Randhir Kapoor', 'Randeep',
    'Mahatma Gandhi Road', 'Pandurang', 'Chinali', 'Lunawat', 'Lundgren', 'Bhadwal', 'Harmanpreet',
    'Haramani', 'Dhanashri', 'Pushkar', 'Kanchan', 'Sunder', 'Kulkarni', 'Laudable work', 'Analysis',
    'Matsushita', 'Fukuoka', 'Hancock', 'Cockburn', 'Essex', 'Penistone', 'therapist', 'grasshopper',
    'bassist', 'Slutsk', 'Retardant', 'SHITAL', 'kshitij',
  ])('a name or word that contains a listed word passes: %j', (text) => {
    expect(hasProfanity(text)).toBe(false)
  })

  test('checks every text it is given', () => {
    expect(hasProfanity('fine', 'also fine')).toBe(false)
    expect(hasProfanity('fine', 'shit')).toBe(true)
  })

  test('normalise() undoes accents, leet digits and stretched letters, but not double letters', () => {
    expect(normalise('Fück')).toBe('fuck')
    expect(normalise('B1TCH')).toBe('bitch')
    expect(normalise('fuuuuck')).toBe('fuck')
    expect(normalise('assess')).toBe('assess')
  })
})

describe('POST /api/posts and /api/posts/:id/replies', () => {
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
  const as = (user) => ({
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${signToken(user)}`).send(body),
  })

  test('a post with profanity is refused with PROFANITY and nothing is stored', async () => {
    const u = await makeUser()
    for (const body of [
      { type: 'social', text: 'this is bullshit honestly' },
      { type: 'qa', text: 'A clean question here', tags: ['dsa', 'fuck'] },
      { type: 'study', text: 'My notes for exams', pdfUrl: 'https://example.com/a.pdf', pdfName: 'shit notes.pdf' },
      { type: 'confession', text: 'I am such a b1tch sometimes' },
    ]) {
      const res = await as(u).post('/api/posts', body)
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ code: 'PROFANITY', message: 'Please remove offensive language before posting.' })
    }
    expect(await Post.countDocuments({ postedBy: u._id })).toBe(0)
  })

  test('clean posts go through, including words that only contain a listed one', async () => {
    const u = await makeUser()
    const res = await as(u).post('/api/posts', { type: 'social', text: 'Class assessment in Scunthorpe, then a cocktail' })
    expect(res.status).toBe(201)
  })

  test('a reply with profanity is refused; a clean reply is saved', async () => {
    const author = await makeUser()
    const replier = await makeUser()
    const post = (await as(author).post('/api/posts', { type: 'social', text: 'Who is coming to the fest?' })).body

    const bad = await as(replier).post(`/api/posts/${post._id}/replies`, { text: 'shut up, asshole' })
    expect(bad.status).toBe(400)
    expect(bad.body).toEqual({ code: 'PROFANITY', message: 'Please remove offensive language before replying.' })
    expect((await Post.findById(post._id).lean()).replies).toHaveLength(0)

    const ok = await as(replier).post(`/api/posts/${post._id}/replies`, { text: 'Me! See you at the assembly' })
    expect(ok.status).toBe(201)
    expect((await Post.findById(post._id).lean()).replies).toHaveLength(1)
    await new Promise(r => setTimeout(r, 300))   // the reply notification is written in the background
  })
})
