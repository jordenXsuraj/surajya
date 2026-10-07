// Uploads without Cloudinary: outside production they are stored on local disk (here a temp dir)
// with the same validation and response shape and served under /uploads. Production — or a
// half-configured Cloudinary — refuses to start instead of falling back to disk.
const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'
// Empty, not deleted: dotenv would otherwise fill them from a developer's server/.env
for (const k of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) process.env[k] = ''
process.env.LOCAL_UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'meetnet-uploads-'))

const crypto   = require('crypto')
const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryServer } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const { signToken } = require('../utils/token')
const { uploadMode, warnIfProductionCloud, localUploadFile, PRODUCTION_CLOUD_NAME, LOCAL_UPLOAD_DIR } = require('../config/uploadMode')
const { UPLOAD_MODE } = require('../config/cloudinary')

const SERVER_DIR = path.join(__dirname, '..')
const ALL = { CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: 'key', CLOUDINARY_API_SECRET: 'secret' }
const NONE = { CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' }

// ───────────────────────────────── which storage
describe('uploadMode', () => {
  test.each(['production', 'development', 'test', undefined])('all three Cloudinary values set → Cloudinary (%s)', (NODE_ENV) => {
    expect(uploadMode({ NODE_ENV, ...ALL })).toBe('cloudinary')
  })

  test.each(['development', 'test', undefined])('none set outside production → local disk (%s)', (NODE_ENV) => {
    expect(uploadMode({ NODE_ENV, ...NONE })).toBe('local')
    expect(uploadMode({ NODE_ENV })).toBe('local')
  })

  test('production without Cloudinary is an error, never local disk', () => {
    expect(() => uploadMode({ NODE_ENV: 'production', ...NONE }))
      .toThrow('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET missing). Production never stores uploads on local disk.')
    expect(() => uploadMode({ NODE_ENV: 'production', ...ALL, CLOUDINARY_API_SECRET: '' }))
      .toThrow('Cloudinary is not configured (CLOUDINARY_API_SECRET missing).')
    expect(() => uploadMode({ NODE_ENV: 'production', ...ALL, CLOUDINARY_API_KEY: '   ' })).toThrow(/not configured/)
  })

  test('half-configured Cloudinary is an error in development too', () => {
    expect(() => uploadMode({ NODE_ENV: 'development', ...NONE, CLOUDINARY_CLOUD_NAME: 'mycloud' }))
      .toThrow('Cloudinary is only partly configured (CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET missing). Set all three, or none to store uploads on local disk.')
  })

  test('this suite runs with local uploads', () => {
    expect(UPLOAD_MODE).toBe('local')
  })
})

// Starts the real server process; it must exit before connecting to anything
function startServer(env) {
  return spawnSync(process.execPath, ['index.js'], {
    cwd: SERVER_DIR,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, MONGO_URI: 'mongodb://127.0.0.1:1/never', PORT: '0', ...env },
    encoding: 'utf8',
    timeout: 30000,
  })
}

describe('startup', () => {
  test('production without Cloudinary refuses to start', () => {
    const r = startServer({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ...NONE })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('❌ Cloudinary is not configured')
    expect(r.stderr).toContain('Production never stores uploads on local disk. Refusing to start.')
    expect(r.stdout).not.toContain('Server running')
  })

  test('production with half the Cloudinary values refuses to start', () => {
    const r = startServer({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), ...ALL, CLOUDINARY_API_KEY: '' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('CLOUDINARY_API_KEY missing')
  })

  test('development with half the Cloudinary values refuses to start', () => {
    const r = startServer({ NODE_ENV: 'development', ...NONE, CLOUDINARY_CLOUD_NAME: 'mycloud' })
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('Cloudinary is only partly configured')
  })
})

describe('warnIfProductionCloud', () => {
  test.each(['development', 'test', undefined])('the production cloud outside production warns (%s)', (NODE_ENV) => {
    const warn = jest.fn()
    expect(warnIfProductionCloud({ NODE_ENV, CLOUDINARY_CLOUD_NAME: ` ${PRODUCTION_CLOUD_NAME.toUpperCase()} ` }, warn)).toBe(true)
    expect(warn.mock.calls[0][0]).toMatch(/PRODUCTION cloud.*local disk instead/)
  })

  test('production, another cloud or no cloud: no warning; keys are never printed', () => {
    const warn = jest.fn()
    expect(warnIfProductionCloud({ NODE_ENV: 'production', CLOUDINARY_CLOUD_NAME: PRODUCTION_CLOUD_NAME }, warn)).toBe(false)
    expect(warnIfProductionCloud({ NODE_ENV: 'development', CLOUDINARY_CLOUD_NAME: 'other' }, warn)).toBe(false)
    expect(warnIfProductionCloud({ NODE_ENV: 'development' }, warn)).toBe(false)
    expect(warn).not.toHaveBeenCalled()
    warnIfProductionCloud({ NODE_ENV: 'development', CLOUDINARY_CLOUD_NAME: PRODUCTION_CLOUD_NAME, CLOUDINARY_API_SECRET: 'secret-abcdefgh' }, warn)
    expect(warn.mock.calls[0][0]).not.toContain('secret-abcdefgh')
  })
})

describe('localUploadFile', () => {
  test('maps only our /uploads URLs to files', () => {
    expect(localUploadFile('http://localhost:5000/uploads/images/post_1_abcdef.jpg'))
      .toBe(path.join(LOCAL_UPLOAD_DIR, 'images', 'post_1_abcdef.jpg'))
    expect(localUploadFile('http://localhost:5000/uploads/pdfs/pdf_1_abcdef.pdf'))
      .toBe(path.join(LOCAL_UPLOAD_DIR, 'pdfs', 'pdf_1_abcdef.pdf'))
    for (const url of ['http://localhost:5000/uploads/images/../../.env', 'http://localhost:5000/uploads/other/x.jpg',
      'https://res.cloudinary.com/demo/image/upload/v1/nexus/x.jpg', 'not a url', null]) {
      expect(localUploadFile(url)).toBeNull()
    }
  })
})

// ───────────────────────────────── local uploads through the API
const PNG  = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636060606000000005000157a0c5e10000000049454e44ae426082', 'hex')
const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a46494600', 'hex'), Buffer.alloc(64, 1), Buffer.from('ffd9', 'hex')])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32, 0)])
const heif = brand => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`), Buffer.alloc(48, 0)])
const PDF  = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

const files = folder => (fs.existsSync(path.join(LOCAL_UPLOAD_DIR, folder)) ? fs.readdirSync(path.join(LOCAL_UPLOAD_DIR, folder)) : [])
const onDisk = url => path.join(LOCAL_UPLOAD_DIR, ...new URL(url).pathname.replace('/uploads/', '').split('/'))

describe('local uploads (no Cloudinary, not production)', () => {
  let mongo
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create()
    await mongoose.connect(mongo.getUri())
    await User.init()
  })
  afterAll(async () => {
    await mongoose.disconnect()
    await mongo.stop()
    fs.rmSync(LOCAL_UPLOAD_DIR, { recursive: true, force: true })
  })
  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}))   // errorHandler logs 400s
  afterEach(() => jest.restoreAllMocks())

  const PASSWORD = 'secret123'
  function makeUser() {
    const n = crypto.randomBytes(4).toString('hex')
    return User.create({
      name: `User ${n}`, username: `u_${n}`, email: `${n}@college.edu`,
      password: PASSWORD, college: 'Test College', year: '2nd', branch: 'CS',
    })
  }
  const as = (user, method, url) => request(app)[method](url).set('Authorization', `Bearer ${signToken(user)}`)
  const uploadImage = (user, buf, contentType, url = '/api/posts/upload-image') =>
    as(user, 'post', url).attach('image', buf, { filename: 'photo', contentType })

  test.each([
    ['image/png', PNG, '.png'],
    ['image/jpeg', JPEG, '.jpg'],
    ['image/webp', WEBP, '.webp'],
    ['image/heic', heif('heic'), '.heic'],
    ['image/heif', heif('mif1'), '.heif'],
  ])('%s is stored on disk, returned as { url } and served back', async (type, buf, ext) => {
    const user = await makeUser()
    const res = await uploadImage(user, buf, type)
    expect(res.status).toBe(200)
    expect(Object.keys(res.body)).toEqual(['url'])
    expect(res.body.url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/uploads/images/post_\\d+_[0-9a-f]{6}\\${ext}$`))
    expect(fs.readFileSync(onDisk(res.body.url)).equals(buf)).toBe(true)

    const served = await request(app).get(new URL(res.body.url).pathname).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(served.status).toBe(200)
    expect(served.headers['x-content-type-options']).toBe('nosniff')
    expect(served.body.equals(buf)).toBe(true)
  })

  test('avatar and cover are stored the same way', async () => {
    const user = await makeUser()
    const avatar = await uploadImage(user, PNG, 'image/png', '/api/users/me/avatar')
    const cover = await uploadImage(user, JPEG, 'image/jpeg', '/api/users/me/cover')
    expect(avatar.status).toBe(200)
    expect(cover.status).toBe(200)
    const saved = await User.findById(user._id).lean()
    expect(saved.avatar).toBe(avatar.body.avatar)
    expect(saved.coverImage).toBe(cover.body.coverImage)
    expect(fs.existsSync(onDisk(saved.avatar))).toBe(true)
    expect(fs.existsSync(onDisk(saved.coverImage))).toBe(true)
  })

  test('a PDF is stored and returned as { url, name, size }', async () => {
    const user = await makeUser()
    const res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', PDF, { filename: 'notes.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ url: expect.stringMatching(/\/uploads\/pdfs\/pdf_\d+_[0-9a-f]{6}\.pdf$/), name: 'notes.pdf', size: PDF.length })
    const served = await request(app).get(new URL(res.body.url).pathname)
    expect(served.status).toBe(200)
    expect(served.headers['content-type']).toBe('application/pdf')
  })

  test('same errors as Cloudinary mode, and nothing is left on disk', async () => {
    const user = await makeUser()
    const before = { images: files('images').length, pdfs: files('pdfs').length }

    let res = await uploadImage(user, Buffer.from('hello'), 'text/plain')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'INVALID_FILE_TYPE', message: 'Only image files allowed (JPG, PNG, WebP, HEIC)' })

    res = await uploadImage(user, Buffer.from('this is not a png'), 'image/png')   // declared type, wrong content
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'INVALID_FILE_TYPE', message: 'That file could not be read. Please choose another one.' })

    const bigImage = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024, 1)])
    res = await uploadImage(user, bigImage, 'image/png')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'FILE_TOO_LARGE', message: 'Image is too large (max 5 MB)' })

    res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(res.body).toEqual({ code: 'INVALID_FILE_TYPE', message: 'Only PDF files allowed' })

    res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', Buffer.from('not a pdf'), { filename: 'a.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('INVALID_FILE_TYPE')

    const bigPdf = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024, 1)])
    res = await as(user, 'post', '/api/posts/upload-pdf').attach('pdf', bigPdf, { filename: 'big.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ code: 'FILE_TOO_LARGE', message: 'PDF is too large (max 10 MB)' })

    res = await as(user, 'post', '/api/users/me/avatar').attach('photo', PNG, { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('LIMIT_UNEXPECTED_FILE')

    expect({ images: files('images').length, pdfs: files('pdfs').length }).toEqual(before)
  })

  test('only uploaded files are served', async () => {
    fs.writeFileSync(path.join(LOCAL_UPLOAD_DIR, '.secret'), 'x')
    for (const url of ['/uploads/.secret', '/uploads/images/', '/uploads/../package.json', '/uploads/%2e%2e/package.json']) {
      expect((await request(app).get(url)).status).toBe(404)
    }
  })

  test('deleting an account deletes its uploaded files, not other people\'s', async () => {
    const gone = await makeUser()
    const other = await makeUser()
    const avatar = (await uploadImage(gone, PNG, 'image/png', '/api/users/me/avatar')).body.avatar
    const image = (await uploadImage(gone, JPEG, 'image/jpeg')).body.url
    const pdf = (await as(gone, 'post', '/api/posts/upload-pdf').attach('pdf', PDF, { filename: 'n.pdf', contentType: 'application/pdf' })).body.url
    const theirs = (await uploadImage(other, PNG, 'image/png')).body.url
    await Post.create({ type: 'study', text: 'notes with attachments', postedBy: gone._id, college: 'Test College', imageUrl: image, pdfUrl: pdf })

    const res = await as(gone, 'delete', '/api/users/me').send({ password: PASSWORD })
    expect(res.status).toBe(204)
    for (const url of [avatar, image, pdf]) expect(fs.existsSync(onDisk(url))).toBe(false)
    expect(fs.existsSync(onDisk(theirs))).toBe(true)
  })
})
