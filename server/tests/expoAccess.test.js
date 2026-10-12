// EXPO_ACCESS_TOKEN (Expo enhanced push security): production must not run without it.
// The API refuses to start, notify.js throws when loaded, and sendTestPush.js refuses to talk
// to anything but a local database, all with the same message naming the variable.
const { spawnSync } = require('child_process')
const path = require('path')

const { expoAccessToken } = require('../services/expoClient')

const SERVER = path.join(__dirname, '..')
const MISSING = /EXPO_ACCESS_TOKEN is not set \(Expo enhanced push security needs it; see docs\/DEPLOYMENT\.md/

// A child node process whose environment has no token, whatever this machine has set
function runNode(args, env) {
  const base = { ...process.env }
  delete base.EXPO_ACCESS_TOKEN
  const res = spawnSync(process.execPath, args, { cwd: SERVER, env: { ...base, ...env }, encoding: 'utf8', timeout: 30_000 })
  return { status: res.status, output: `${res.stdout}\n${res.stderr}` }
}

describe('expoAccessToken()', () => {
  test('production without it (or blank): throws, naming the variable and the doc', () => {
    expect(() => expoAccessToken({ env: { NODE_ENV: 'production' } })).toThrow(MISSING)
    expect(() => expoAccessToken({ env: { NODE_ENV: 'production', EXPO_ACCESS_TOKEN: '   ' } })).toThrow(MISSING)
  })

  test('production with it: the trimmed token', () => {
    expect(expoAccessToken({ env: { NODE_ENV: 'production', EXPO_ACCESS_TOKEN: ' robot-token ' } })).toBe('robot-token')
  })

  test('outside production it is optional, unless the caller requires it', () => {
    expect(expoAccessToken({ env: { NODE_ENV: 'development' } })).toBe('')
    expect(expoAccessToken({ env: { NODE_ENV: 'test', EXPO_ACCESS_TOKEN: 'robot-token' } })).toBe('robot-token')
    expect(() => expoAccessToken({ env: { NODE_ENV: 'development' }, required: true })).toThrow(MISSING)
  })
})

describe('production without EXPO_ACCESS_TOKEN fails loudly', () => {
  test('the API refuses to start (before connecting to the database)', () => {
    const { status, output } = runNode(['index.js'], {
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(40),
      MONGO_URI: 'mongodb://127.0.0.1:9/never-used',
    })
    expect(status).toBe(1)
    expect(output).toMatch(MISSING)
    expect(output).toMatch(/Refusing to start in production/)
  })

  test('notify.js throws when it is loaded', () => {
    const { status, output } = runNode(['-e', "require('./services/notify')"], { NODE_ENV: 'production' })
    expect(status).not.toBe(0)
    expect(output).toMatch(MISSING)
  })

  test('notify.js loads in production when it is set', () => {
    const { status, output } = runNode(['-e', "require('./services/notify'); console.log('loaded')"], {
      NODE_ENV: 'production',
      EXPO_ACCESS_TOKEN: 'robot-token',
    })
    expect(output).toMatch(/loaded/)
    expect(status).toBe(0)
  })

  test.each([
    ['a remote database', { NODE_ENV: 'development', MONGO_URI: 'mongodb+srv://u:p@cluster.example.invalid/meetnet' }],
    ['NODE_ENV=production', { NODE_ENV: 'production', MONGO_URI: 'mongodb://127.0.0.1:9/meetnet_local' }],
  ])('sendTestPush.js refuses %s, before connecting', (_name, env) => {
    const { status, output } = runNode(['scripts/sendTestPush.js', 'someone@college.edu', '--dry'], env)
    expect(status).toBe(1)
    expect(output).toMatch(MISSING)
    expect(output).not.toMatch(/User found|No user|ENOTFOUND|ECONNREFUSED|querySrv/) // never got to the database
  })
})
