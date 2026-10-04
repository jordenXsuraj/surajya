// Permanent account deletion (App Store 5.1.1(v), Google Play account deletion policy).
// Every step is idempotent and the user document is deleted LAST, so a failed
// run can simply be retried. On a replica set (MongoDB Atlas) it all runs in
// one transaction. Cloudinary cleanup is best effort, after the data is gone.

const mongoose = require('mongoose')
const User = require('../models/User')
const Post = require('../models/Post')
const Notification = require('../models/Notification')
const Report = require('../models/Report')
const PasswordReset = require('../models/PasswordReset')

async function supportsTransactions() {
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 })
    return Boolean(hello.setName || hello.msg === 'isdbgrid')
  } catch {
    return false
  }
}

async function deleteUserData(userId, session) {
  const opt = session ? { session } : {}
  const me = new mongoose.Types.ObjectId(String(userId))

  const user  = await User.findById(me).select('avatar coverImage').session(session).lean()
  const posts = await Post.find({ postedBy: me }).select('_id imageUrl pdfUrl').session(session).lean()
  const postIds = posts.map(p => p._id)

  // Ids of this user's replies on other people's posts (to clean reply reports)
  const repliedOn = await Post.find({ 'replies.postedBy': me }).select('replies._id replies.postedBy').session(session).lean()
  const replyIds = repliedOn.flatMap(p => p.replies.filter(r => String(r.postedBy) === String(me)).map(r => r._id))

  await Post.deleteMany({ postedBy: me }, opt)

  // Remove their replies elsewhere and recount (aggregation-pipeline update)
  await Post.updateMany({ 'replies.postedBy': me }, [
    { $set: { replies: { $filter: { input: '$replies', cond: { $ne: ['$$this.postedBy', me] } } } } },
    { $set: { replyCount: { $size: '$replies' } } },
  ], { ...opt, updatePipeline: true })

  await Post.updateMany({ likes: me }, { $pull: { likes: me } }, opt)

  await User.updateMany(
    { $or: [{ following: me }, { followers: me }, { pendingRequests: me }, { sentRequests: me }, { blockedUsers: me }] },
    { $pull: { following: me, followers: me, pendingRequests: me, sentRequests: me, blockedUsers: me } },
    opt
  )
  if (postIds.length) {
    await User.updateMany(
      { $or: [{ likedPosts: { $in: postIds } }, { savedPosts: { $in: postIds } }] },
      { $pull: { likedPosts: { $in: postIds }, savedPosts: { $in: postIds } } },
      opt
    )
  }

  await Notification.deleteMany({
    $or: [{ sender: me }, { recipient: me }, ...(postIds.length ? [{ post: { $in: postIds } }] : [])],
  }, opt)

  // Reports they filed, and reports whose target no longer exists
  await Report.deleteMany({
    $or: [
      { reportedBy: me },
      { targetType: 'user', user: me },
      ...(postIds.length ? [{ post: { $in: postIds } }] : []),
      ...(replyIds.length ? [{ targetType: 'reply', replyId: { $in: replyIds } }] : []),
    ],
  }, opt)

  await PasswordReset.deleteMany({ user: me }, opt)
  await User.deleteOne({ _id: me }, opt)

  return { user, posts }
}

// https://res.cloudinary.com/<cloud>/<image|raw>/upload/v123/<folder>/<id>[.ext]
const OWN_FOLDERS = ['nexus/', 'meetnet_pdfs/']
function cloudinaryAsset(url) {
  const m = typeof url === 'string' && url.match(/^https?:\/\/res\.cloudinary\.com\/([^/]+)\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+)$/)
  if (!m) return null
  const [, cloud, resourceType, rest] = m
  if (process.env.CLOUDINARY_CLOUD_NAME && cloud !== process.env.CLOUDINARY_CLOUD_NAME) return null
  if (!OWN_FOLDERS.some(f => rest.startsWith(f))) return null
  // Image/video public ids exclude the extension; raw files keep theirs
  const publicId = resourceType === 'raw' ? rest : rest.replace(/\.[a-z0-9]+$/i, '')
  return { publicId, resourceType }
}

async function deleteCloudinaryAssets(urls) {
  const assets = urls.map(cloudinaryAsset).filter(Boolean)
  if (!assets.length) return { attempted: 0, failed: 0 }
  const { cloudinary } = require('../config/cloudinary')
  const results = await Promise.allSettled(assets.map(a =>
    cloudinary.uploader.destroy(a.publicId, { resource_type: a.resourceType, invalidate: true })))
  const failed = results.filter(r => r.status === 'rejected' || !['ok', 'not found'].includes(r.value?.result))
  failed.forEach(f => console.error('account deletion: Cloudinary cleanup failed:', f.reason?.message ?? f.value?.result))
  return { attempted: assets.length, failed: failed.length }
}

async function deleteAccount(userId) {
  let data
  if (await supportsTransactions()) {
    const session = await mongoose.startSession()
    try {
      await session.withTransaction(async () => { data = await deleteUserData(userId, session) })
    } finally {
      await session.endSession()
    }
  } else {
    data = await deleteUserData(userId, null)
  }

  const urls = [data.user?.avatar, data.user?.coverImage, ...data.posts.flatMap(p => [p.imageUrl, p.pdfUrl])]
  const cloud = await deleteCloudinaryAssets(urls).catch(err => {
    console.error('account deletion: Cloudinary cleanup failed:', err.message)
    return { attempted: 0, failed: 0 }
  })
  return { posts: data.posts.length, cloudinary: cloud }
}

module.exports = { deleteAccount, cloudinaryAsset, supportsTransactions }
