// GET /healthz names the deployed commit (Render's RENDER_GIT_COMMIT, 7 characters), so a deploy
// is confirmed by its SHA. No database needed.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'

const request = require('supertest')
const app = require('../index')
const { shortCommit } = require('../utils/deployInfo')

afterEach(() => { delete process.env.RENDER_GIT_COMMIT })

test('on Render: "OK" and the short commit', async () => {
  process.env.RENDER_GIT_COMMIT = '2E1144B0c9f7a1d3e5b2c4d6e8f0a1b2c3d4e5f6'
  const res = await request(app).get('/healthz')
  expect(res.status).toBe(200)
  expect(res.headers['content-type']).toMatch(/^text\/plain/)
  expect(res.text).toBe('OK 2e1144b')
})

test('locally (no RENDER_GIT_COMMIT): "OK unknown"', async () => {
  const res = await request(app).get('/healthz')
  expect(res.status).toBe(200)
  expect(res.text).toBe('OK unknown')
})

test('only a git SHA is shown, never anything else from the variable', () => {
  expect(shortCommit('abc1234')).toBe('abc1234')
  expect(shortCommit(' abcdef1234 ')).toBe('abcdef1')
  expect(shortCommit('abc12')).toBe('unknown')         // too short
  expect(shortCommit('not-a-sha-value')).toBe('unknown')
  expect(shortCommit('<script>alert(1)</script>')).toBe('unknown')
  expect(shortCommit(undefined)).toBe('unknown')
})
