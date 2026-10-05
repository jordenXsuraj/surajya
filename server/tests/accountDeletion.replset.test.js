// Account deletion on a replica set (like MongoDB Atlas) runs inside a transaction.
process.env.NODE_ENV   = 'test'
process.env.JWT_SECRET = 'test_secret_that_is_definitely_longer_than_32_chars'
process.env.VERIFICATION_REQUIRED_FROM = '2999-01-01T00:00:00Z'   // these suites predate email verification

const request  = require('supertest')
const mongoose = require('mongoose')
const { MongoMemoryReplSet } = require('mongodb-memory-server')

const app  = require('../index')
const User = require('../models/User')
const Post = require('../models/Post')
const Notification = require('../models/Notification')
const { signToken } = require('../utils/token')
const accountDeletion = require('../services/accountDeletion')

let replSet

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })
  await mongoose.connect(replSet.getUri())
  await User.init()
})
afterAll(async () => {
  await mongoose.disconnect()
  await replSet.stop()
})

test('detects transaction support and deletes everything inside one', async () => {
  expect(await accountDeletion.supportsTransactions()).toBe(true)
  const startSession = jest.spyOn(mongoose, 'startSession')

  const gone  = await User.create({ name: 'Gone', email: 'gone@college.edu', password: 'secret123', college: 'C' })
  const other = await User.create({ name: 'Other', email: 'other@college.edu', password: 'secret123', college: 'C',
    followers: [gone._id] })
  await Post.create({ type: 'social', text: 'post by gone user', postedBy: gone._id, college: 'C' })
  const theirs = await Post.create({ type: 'social', text: 'post by other user', postedBy: other._id, college: 'C',
    replies: [{ text: 'gone reply', postedBy: gone._id }], replyCount: 1, likes: [gone._id] })
  await Notification.create({ recipient: other._id, sender: gone._id, type: 'post_liked', message: 'x' })

  const res = await request(app).delete('/api/users/me')
    .set('Authorization', `Bearer ${signToken(gone)}`).send({ password: 'secret123' })
  expect(res.status).toBe(204)
  expect(startSession).toHaveBeenCalled()

  expect(await User.exists({ _id: gone._id })).toBeNull()
  expect(await Post.countDocuments({ postedBy: gone._id })).toBe(0)
  const t = await Post.findById(theirs._id).lean()
  expect(t).toMatchObject({ replies: [], replyCount: 0, likes: [] })
  expect((await User.findById(other._id).lean()).followers).toEqual([])
  expect(await Notification.countDocuments({ sender: gone._id })).toBe(0)
})
