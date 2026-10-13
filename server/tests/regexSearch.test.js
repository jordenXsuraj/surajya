// Search and skill filters on GET /api/users and /api/users/all: user text is matched literally
// (never as a regular expression) and only its first 50 characters are used.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'

const request  = require('supertest')
const mongoose = require('mongoose')
const jwt      = require('jsonwebtoken')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const MAX_SEARCH_LENGTH = 50

let mongo, token

function makeUser(overrides = {}) {
  const n = Math.random().toString(36).slice(2, 8)
  return User.create({
    name: `User ${n}`, username: `user_${n}`, email: `${n}@college.edu`,
    password: 'secret123', college: 'Test College', year: '2nd', branch: 'CS',
    ...overrides,
  })
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create()
  await mongoose.connect(mongo.getUri())
  const me = await makeUser({ email: 'me@college.edu', name: 'Searching Student' })
  token = jwt.sign({ id: me._id }, process.env.JWT_SECRET)
  await makeUser({ name: 'Cee Plus', skills: ['C++', 'Python'] })
  await makeUser({ name: 'Rea Ct', skills: ['React', 'CSS'] })
  await makeUser({ name: 'Node Dev', skills: ['Node.js'] })
  await makeUser({ name: 'Nodexjs Fan', skills: ['Nodexjs'] })
  await makeUser({ name: 'Aaaa Aaaa', skills: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaa!'] })
  await makeUser({ name: 'Other Campus', college: 'Far College', skills: ['C++'] })
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongo.stop()
})

const get = (path, query) => request(app).get(path).query(query).set('Authorization', `Bearer ${token}`)
const names = res => res.body.map(u => u.name).sort()

describe.each([
  ['/api/users', ['Cee Plus']],
  ['/api/users/all', ['Cee Plus', 'Other Campus']],
])('%s', (path, cPlusPlus) => {
  test('skill "C++" matches only C++ (not every skill with a "c")', async () => {
    const res = await get(path, { skill: 'C++' })
    expect(res.status).toBe(200)
    expect(names(res)).toEqual(cPlusPlus)
  })

  test('skill "Node.js" matches the dot literally', async () => {
    const res = await get(path, { skill: 'Node.js' })
    expect(res.status).toBe(200)
    expect(names(res)).toEqual(['Node Dev'])
  })

  test('".*" is text, not "anything"', async () => {
    const skill = await get(path, { skill: '.*' })
    expect(skill.status).toBe(200)
    expect(skill.body).toEqual([])
    const search = await get(path, { search: '.*' })
    expect(search.status).toBe(200)
    expect(search.body).toEqual([])
  })

  test('"(a+)+$" (catastrophic backtracking as a regex) answers at once, with no match', async () => {
    const t0 = Date.now()
    const res = await get(path, { skill: '(a+)+$', search: '(a+)+$' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(Date.now() - t0).toBeLessThan(2000)
  })

  test('only the first 50 characters are searched; a huge query is not an error', async () => {
    const long = `Cee${'x'.repeat(MAX_SEARCH_LENGTH - 3)}`
    const hit = await get(path, { search: `${'Cee Plus'.padEnd(MAX_SEARCH_LENGTH, ' ')}ignored after the cap` })
    expect(hit.status).toBe(200)
    expect(names(hit)).toEqual(['Cee Plus'])
    const miss = await get(path, { search: long })
    expect(miss.status).toBe(200)
    expect(miss.body).toEqual([])
    const huge = await get(path, { search: 'a'.repeat(100_000).slice(0, 5000), skill: 'b'.repeat(5000) })
    expect(huge.status).toBe(200)
  })

  test('a repeated parameter (?skill=a&skill=b) is ignored, not a server error', async () => {
    const res = await request(app).get(`${path}?skill=C%2B%2B&skill=React&search=a&search=b`)
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  test('"All" and empty values still list everyone', async () => {
    const all = await get(path, { skill: 'All', search: '   ' })
    expect(all.status).toBe(200)
    expect(all.body.length).toBeGreaterThanOrEqual(cPlusPlus.length === 1 ? 5 : 6)
  })
})

describe('utils/searchText', () => {
  const util = () => require('../utils/searchText')

  test('literal() escapes every regex character', () => {
    const { literal } = util()
    expect(literal('C++')).toBe('C\\+\\+')
    expect(literal('.*')).toBe('\\.\\*')
    expect(literal('(a+)+$')).toBe('\\(a\\+\\)\\+\\$')
    expect(new RegExp(literal('[x]{2}|^?'), 'i').test('[x]{2}|^?')).toBe(true)
  })

  test('searchText() keeps trimmed strings up to 50 characters, nothing else', () => {
    const { searchText } = util()
    expect(searchText('  hi  ')).toBe('hi')
    expect(searchText('x'.repeat(80))).toHaveLength(MAX_SEARCH_LENGTH)
    expect(searchText(['a', 'b'])).toBe('')
    expect(searchText(undefined)).toBe('')
    expect(searchText({ $ne: 1 })).toBe('')
  })
})
