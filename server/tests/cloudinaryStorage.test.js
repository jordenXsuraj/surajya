// Our multer storage engine (config/cloudinaryStorage.js) with the real cloudinary 2.x library,
// pointed at a local stand-in for Cloudinary's upload API, and the public-id check used at
// account deletion (services/accountDeletion.js).
process.env.NODE_ENV = 'test'

const http     = require('http')
const https    = require('https')
const express  = require('express')
const multer   = require('multer')
const request  = require('supertest')
const cloudinary = require('cloudinary').v2
const { CloudinaryStorage } = require('../config/cloudinaryStorage')
const { cloudinaryAsset } = require('../services/accountDeletion')

let server
let calls = []          // { url, body } per request the stand-in received
let reply = () => ({ status: 200, json: {} })

beforeAll(done => {
  // The library only speaks HTTPS; the stand-in is plain HTTP on 127.0.0.1
  jest.spyOn(https, 'request').mockImplementation((options, cb) => http.request(options, cb))
  server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      const call = { url: req.url, body: Buffer.concat(chunks).toString('latin1') }
      calls.push(call)
      const { status, json } = reply(call)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(json))
    })
  }).listen(0, '127.0.0.1', () => {
    cloudinary.config({
      cloud_name: 'demo', api_key: 'test-key', api_secret: 'test-secret',
      upload_prefix: `http://127.0.0.1:${server.address().port}`,
    })
    done()
  })
})
afterAll(done => { server.close(() => done()) })
beforeEach(() => { calls = [] })

// A form field as Cloudinary's multipart upload sends it
const field = (body, name) => body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1]

function appWith(params) {
  const app = express()
  const upload = multer({ storage: new CloudinaryStorage({ cloudinary, params }) })
  app.post('/up', upload.single('file'), (req, res) => res.json(req.file))
  app.use((err, req, res, next) => res.status(err.http_code || 500).json({ message: err.message, code: err.code }))
  return app
}

describe('CloudinaryStorage', () => {
  test('streams the file with the given options and fills req.file like before', async () => {
    reply = () => ({ status: 200, json: {
      secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/post_1_ab.jpg',
      public_id: 'nexus/post_1_ab', bytes: 1234, resource_type: 'image' } })
    const app = appWith(async (req, file) => ({
      folder: 'nexus', resource_type: 'image', public_id: 'post_1_ab',
      ...(file.mimetype === 'image/heic' && { format: 'jpg' }),
      transformation: [{ width: 1080, crop: 'limit' }, { quality: 'auto' }],
    }))
    const res = await request(app).post('/up')
      .attach('file', Buffer.from('fake heic bytes'), { filename: 'a.heic', contentType: 'image/heic' })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      path: 'https://res.cloudinary.com/demo/image/upload/v1/nexus/post_1_ab.jpg',
      size: 1234, filename: 'nexus/post_1_ab', resourceType: 'image', originalname: 'a.heic',
    })
    expect(calls).toHaveLength(1)
    const { url, body } = calls[0]
    expect(url).toBe('/v1_1/demo/image/upload')
    expect(field(body, 'folder')).toBe('nexus')
    expect(field(body, 'public_id')).toBe('post_1_ab')
    expect(field(body, 'format')).toBe('jpg')
    expect(field(body, 'transformation')).toBe('c_limit,w_1080/q_auto')
    expect(field(body, 'api_key')).toBe('test-key')
    expect(field(body, 'signature')).toMatch(/^[0-9a-f]{40}$/)   // signed, the secret itself is never sent
    expect(body).not.toContain('test-secret')
    expect(body).toContain('fake heic bytes')
  })

  test('a fixed options object works too (PDFs go to the raw upload API)', async () => {
    reply = () => ({ status: 200, json: {
      secure_url: 'https://res.cloudinary.com/demo/raw/upload/v1/meetnet_pdfs/pdf_1', public_id: 'meetnet_pdfs/pdf_1',
      bytes: 9, resource_type: 'raw' } })
    const app = appWith({ folder: 'meetnet_pdfs', resource_type: 'raw' })
    const res = await request(app).post('/up')
      .attach('file', Buffer.from('%PDF-1.4\n'), { filename: 'a.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ filename: 'meetnet_pdfs/pdf_1', resourceType: 'raw', size: 9 })
    expect(calls[0].url).toBe('/v1_1/demo/raw/upload')
  })

  test('Cloudinary refusing the file reaches the error handler with its http_code', async () => {
    reply = () => ({ status: 400, json: { error: { message: 'Invalid image file' } } })
    const app = appWith({ folder: 'nexus', resource_type: 'image' })
    const res = await request(app).post('/up')
      .attach('file', Buffer.from('not an image'), { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Invalid image file')
  })

  test('an error while building the options fails the request without uploading', async () => {
    const app = appWith(async () => { throw new Error('no options') })
    const res = await request(app).post('/up')
      .attach('file', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe('no options')
    expect(calls).toHaveLength(0)
  })

  test('a file multer drops after the upload is deleted again, raw files included', async () => {
    reply = ({ url }) => url.endsWith('/upload')
      ? { status: 200, json: { secure_url: 'https://res.cloudinary.com/demo/raw/upload/v1/meetnet_pdfs/pdf_2',
          public_id: 'meetnet_pdfs/pdf_2', bytes: 9, resource_type: 'raw' } }
      : { status: 200, json: { result: 'ok' } }
    const app = appWith({ folder: 'meetnet_pdfs', resource_type: 'raw' })
    const res = await request(app).post('/up')
      .attach('file', Buffer.from('%PDF-1.4\n'), { filename: 'a.pdf', contentType: 'application/pdf' })
      .attach('extra', Buffer.from('%PDF-1.4\n'), { filename: 'b.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(500)
    expect(res.body.code).toBe('LIMIT_UNEXPECTED_FILE')
    // multer cleans up asynchronously
    for (let i = 0; i < 50 && calls.length < 2; i++) await new Promise(r => setTimeout(r, 20))
    expect(calls.map(c => c.url)).toEqual(['/v1_1/demo/raw/upload', '/v1_1/demo/raw/destroy'])
    expect(field(calls[1].body, 'public_id') ?? calls[1].body).toContain('meetnet_pdfs/pdf_2')
    expect(calls[1].body).toContain('invalidate')
  })

  test('needs a cloudinary instance', () => {
    expect(() => new CloudinaryStorage({})).toThrow(/cloudinary/)
  })
})

describe('cloudinaryAsset (what account deletion may destroy)', () => {
  const base = 'https://res.cloudinary.com/demo'
  beforeAll(() => { process.env.CLOUDINARY_CLOUD_NAME = 'demo' })
  afterAll(() => { delete process.env.CLOUDINARY_CLOUD_NAME })

  test.each([
    [`${base}/image/upload/v1/nexus/post_1_ab.jpg`, { publicId: 'nexus/post_1_ab', resourceType: 'image' }],
    [`${base}/image/upload/nexus/post-avatar.png`,  { publicId: 'nexus/post-avatar', resourceType: 'image' }],
    [`${base}/raw/upload/v3/meetnet_pdfs/pdf_1_x9`, { publicId: 'meetnet_pdfs/pdf_1_x9', resourceType: 'raw' }],
    // PDFs uploaded while the id still ended in .pdf
    [`${base}/raw/upload/v3/meetnet_pdfs/pdf_1_x9.pdf`, { publicId: 'meetnet_pdfs/pdf_1_x9.pdf', resourceType: 'raw' }],
  ])('accepts our own upload %s', (url, expected) => {
    expect(cloudinaryAsset(url)).toEqual(expected)
  })

  test.each([
    `${base}/image/upload/v1/nexus/post_1&invalidate=false.jpg`,
    `${base}/image/upload/v1/nexus/a?b.jpg`,
    `${base}/image/upload/v1/nexus/../other/x.jpg`,
    `${base}/image/upload/v1/nexus/a%20b.jpg`,
    `${base}/image/upload/v1/nexus/a b.jpg`,
    `${base}/image/upload/v1/nexus//x.jpg`,
    `${base}/image/upload/v1/nexus/a.b.jpg`,
    `${base}/raw/upload/v1/meetnet_pdfs/pdf_1.exe`,
    // .pdf only as one final suffix of a raw file, inside our folder
    `${base}/raw/upload/v1/meetnet_pdfs/a.b.pdf`,
    `${base}/raw/upload/v1/meetnet_pdfs/x.pdf.jpg`,
    `${base}/raw/upload/v1/meetnet_pdfs/../x.pdf`,
    `${base}/raw/upload/v1/../x.pdf`,
    `${base}/raw/upload/v1/x.pdf`,
    `${base}/raw/upload/v1/meetnet_pdfs/x.PDF`,
    `${base}/image/upload/v1/nexus/a.b.pdf`,
    `${base}/image/upload/v1/nexus/x.pdf.jpg`,
    `${base}/image/upload/v1/nexus/../x.pdf`,
    `${base}/raw/upload/v1/meetnet_pdfs/pdf_1;x`,
    `${base}/image/upload/v1/someone_else/x.jpg`,
    'https://res.cloudinary.com/other-cloud/image/upload/v1/nexus/x.jpg',
    'https://example.com/nexus/x.jpg',
    null,
  ])('refuses %s', url => {
    expect(cloudinaryAsset(url)).toBeNull()
  })
})
