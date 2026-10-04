

const express      = require('express')
const mongoose     = require('mongoose')
const router       = express.Router()
const Post       = require('../models/Post')
const User         = require('../models/User')
const Notification = require('../models/Notification')
const Report       = require('../models/Report')
const protect      = require('../middleware/auth')
const { sanitizePost, sanitizeReply, sanitizeLikes } = require('../utils/sanitizePost')
const { getBlockSets, addPostBlockFilter, isPostHidden } = require('../utils/blocks')
const { notify, notifyFollowers } = require('../services/notify')

const REPORT_REASONS = ['spam','hate','harassment','misinformation','other']

// Loads the fields needed for block checks; null when missing or hidden from this viewer
async function visiblePost(req, fields = 'postedBy isAnonymous') {
  if (!mongoose.isValidObjectId(req.params.id)) return null
  const post = await Post.findById(req.params.id).select(fields).lean()
  if (!post || isPostHidden(post, await getBlockSets(req.user))) return null
  return post
}
//const { upload }   = require('../config/cloudinary')


const { upload, pdfUpload } = require('../config/cloudinary')


function collegeRegex(college) {
  return {
    $regex: new RegExp(
      '^' + college.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
      'i'
    )
  }
}

// ── SCORING FUNCTION ──────────────────────────────
function scorePost(post, user, followingSet) {
  let score = 0

  const ageHours = (Date.now() - new Date(post.createdAt)) / 3600000
  const authorId = post.postedBy?._id?.toString() || post.postedBy?.toString()

  // Signal 1: Following — posts from people you follow (strongest signal)
 // const followingSet = new Set((user.following || []).map(id => id.toString()))
if (authorId && followingSet.has(authorId)) score += 80
  // Signal 2: Recency
  score += Math.max(0, 50 - ageHours * 1.2)

  // Signal 3: Engagement
  const likes   = post.likes?.length   || 0
  const replies = post.replies?.length || 0
  score += Math.min((likes + replies * 1.5) * 2, 25)

  // Signal 4: Same branch
  if (post.postedByBranch === user.branch) score += 18

  // Signal 5: Same year
  if (post.postedByYear === user.year) score += 12

  // Signal 6: Post type preference
  const typeEng   = user.typeEngagement || {}
  const typeScore = typeEng[post.type]  || 0
  score += Math.min(typeScore * 4, 20)

  // Signal 7: High-engagement types
  if (post.type === 'confession' || post.type === 'qa') score += 8

  // Signal 8: Small randomness so feed feels fresh
  score += Math.random() * 6  // by this feed chamges every fresh

  return score
}

// ─────────────────────────────────────────────────
// GET /api/posts
// GET /api/posts?type=placement
// GET /api/posts?global=true
// GET /api/posts?connections=true  ← Following feed
// ─────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {

    const page  = parseInt(req.query.page) || 1
const limit = parseInt(req.query.limit) || 20
const skip  = (page - 1) * limit



    const { type, global: isGlobal, connections } = req.query

    // ── FIX: connections=true now uses user.following (not user.connections) ──
    if (connections === 'true') {
      // Get my following list fresh from DB (req.user may be stale)
      const me = await User.findById(req.user._id).select('following').lean()
      const followingIds = (me.following || [])

      if (followingIds.length === 0) return res.json([])

      const sets   = await getBlockSets(req.user)
      // Anonymous posts never appear here: a feed limited to people you follow
      // would narrow down who wrote them (they stay in the college/global feeds)
      const filter = addPostBlockFilter({
  postedBy: { $in: followingIds },
  isAnonymous: { $ne: true },
  $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
}, sets)

      if (type && type !== 'all' && type !== '') filter.type = type

      const posts = await Post.find(filter)
        .populate('postedBy', 'name year branch avatar isContributor')
        .populate({
            path: 'replies.postedBy',
                select: 'name year branch avatar',
            options: { limit: 5 }   // only 2 replies
               })
        .sort({ createdAt: -1 })
        .skip(skip).limit(limit)
        .lean()

      return res.json(posts.map(p => sanitizePost(p, req.user._id, sets)))
    }

    // ── Normal feed (college or global) ──
    const now = new Date()
    const filter = isGlobal === 'true'
  ? { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }
  : {
      college: collegeRegex(req.user.college),
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
    }

    if (type && type !== 'all' && type !== '') filter.type = type

    const sets = await getBlockSets(req.user)
    addPostBlockFilter(filter, sets)

    // Get user with following info for personalization
    const user = await User.findById(req.user._id)
      .select('following branch year typeEngagement')
      .lean()

    const rawPosts = await Post.find(filter)
.populate('postedBy', 'name year branch avatar isContributor')
.populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }   // only 5 replies
})
      .sort({ createdAt: -1 })
      .skip(skip).limit(limit)
      .lean()
const followingSet = new Set((user.following || []).map(id => id.toString()))
    const postsWithMeta = rawPosts.map(p => ({
      ...p,
      postedByBranch: p.postedBy?.branch,
      postedByYear:   p.postedBy?.year,
    }))

    const scored = postsWithMeta
      .map(p => ({ post: p, score: scorePost(p, user, followingSet) }))
      .sort((a, b) => b.score - a.score)

const result = scored.map(({ post: raw }) => {
  const post = sanitizePost(raw, req.user._id, sets)
  delete post.postedByBranch
  delete post.postedByYear
  post.replies = (post.replies || []).slice(-5) // ← last 5 only
  return post
})

    res.json(result)
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ── Image Upload to Cloudinary ──────────────────
// POST /api/posts/upload-image
router.post('/upload-image', protect, upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image received' })
  //  console.log('Image uploaded:', req.file.path)
    return res.json({ url: req.file.path })
  } catch (err) {
    console.error('Upload error:', err.message)
    return res.status(500).json({ message: err.message })
  }
})


// ── PDF Upload ─────────────────────────────────
router.post('/upload-pdf', protect, pdfUpload.single('pdf'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No PDF received' })
    return res.json({
      url:  req.file.path,
      name: req.file.originalname,
      size: req.file.size,
    })
  } catch (err) {
    console.error('PDF upload error:', err.message)
    return res.status(500).json({ message: err.message })
  }
})




function extractYoutubeId(url = '') {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/i
  )
  return m ? m[1] : ''
}




// ─────────────────────────────────────────────────
// POST /api/posts — Create post
// ─────────────────────────────────────────────────
router.post('/', protect, async (req, res) => {
  try {
    const {
  type,
  text,
  tags,
  link,
  imageUrl,
  youtubeUrl,
  pdfUrl,
  pdfName,
  pdfSize,
  isAnonymous,
  todayOnly
} = req.body

    if (!text?.trim()) return res.status(400).json({ message: 'Post text required' })
    if (text.trim().length < 5) return res.status(400).json({ message: 'Post too short' })

    const validTypes = ['social','placement','qa','study','project','confession']
    if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid type' })



      const ytId = youtubeUrl ? extractYoutubeId(youtubeUrl) : ''

if (imageUrl && ytId) {
  return res.status(400).json({
    message: 'Choose either image or YouTube video'
  })
}


    const cleanTags = Array.isArray(tags)
      ? tags.map(t => t.toString().trim().replace(/^#/, '')).filter(Boolean).slice(0, 5)
      : []

 
// If todayOnly, post expires in 24 hours
const expiresAt = todayOnly
  ? new Date(Date.now() + 24 * 60 * 60 * 1000)
  : null

const post = await Post.create({
  type,
  text:        text.trim(),
  tags:        cleanTags,
  link:        link?.trim()   || '',
  imageUrl:    imageUrl       || '',

youtubeUrl: youtubeUrl || '',
youtubeId: ytId || '',

  isAnonymous: Boolean(isAnonymous),
  expiresAt,
  postedBy:    req.user._id,
  college:     req.user.college.trim(),
  pdfUrl:  pdfUrl  || '',
  pdfName: pdfName || '',
 pdfSize: pdfSize || 0,
})

    await post.populate('postedBy', 'name year branch avatar isContributor')

    // Notify followers in background
    if (!isAnonymous) {
      // Get fresh followers list
      const me = await User.findById(req.user._id).select('followers').lean()
      notifyFollowers({
        sender:      req.user._id,
        followerIds: me.followers || [],
        post:        post._id,
        message:     `${req.user.name} shared a new ${type} post`
      })
    }

    res.status(201).json(sanitizePost(post, req.user._id))
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})




// GET /api/posts/admin/reports  (only you can access this — add your email check)
router.get('/admin/reports', protect, async (req, res) => {
  try {
    // Only allow your own account
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL // set this in your .env
   if (
  req.user.email !== process.env.ADMIN_EMAIL ||
  req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY
) {
  return res.status(403).json({ message: 'Not authorized' })
}

    const reports = await Report.find({ status: 'pending' })
      .populate('post', 'text imageUrl type postedBy college createdAt replies')
      .populate('user', 'name username college avatar')
      .populate('reportedBy', 'name college')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean()

    // Older reports have no targetType; reply reports carry the reply itself.
    // Reports of the same post share one populated object, so copy — never mutate.
    res.json(reports.map(r => {
      const targetType = r.targetType || 'post'
      const { replies = [], ...post } = r.post || {}
      let reply = null
      if (targetType === 'reply') {
        const found = replies.find(x => String(x._id) === String(r.replyId))
        reply = found ? { _id: found._id, text: found.text, postedBy: found.postedBy, createdAt: found.createdAt } : null
      }
      return { ...r, post: r.post ? post : null, targetType, reply }
    }))
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// POST /api/posts/admin/dismiss/:reportId
router.post('/admin/dismiss/:reportId', protect, async (req, res) => {
  try {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL
   if (
  req.user.email !== process.env.ADMIN_EMAIL ||
  req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY
) {
  return res.status(403).json({ message: 'Not authorized' })
}
    const Report = require('../models/Report')
    await Report.findByIdAndUpdate(req.params.reportId, { status: 'dismissed' })
    res.json({ message: 'Dismissed' })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

router.delete('/admin/post/:postId', protect, async (req, res) => {
  try {
    if (
      req.user.email !== process.env.ADMIN_EMAIL ||
      req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY
    ) {
      return res.status(403).json({ message: 'Not authorized' })
    }

    const post = await Post.findByIdAndDelete(req.params.postId)

    if (!post) {
      return res.status(404).json({ message: 'Post not found' })
    }

    res.json({ message: 'Post deleted successfully' })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})



router.get('/admin/stats', protect, async (req, res) => {
  try {
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL
   if (
  req.user.email !== process.env.ADMIN_EMAIL ||
  req.headers['x-admin-key'] !== process.env.ADMIN_SECRET_KEY
) {
  return res.status(403).json({ message: 'Not authorized' })

    }

    const User = require('../models/User')
    const Report = require('../models/Report')

    const now = new Date()
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const thisWeek  = new Date(now - 7  * 24 * 60 * 60 * 1000)
   // const thisMonth = new Date(now - 30 * 24 * 60 * 60 * 1000)

    const [
      totalUsers,
      totalPosts,
      usersToday,
      postsToday,
      usersThisWeek,
      postsThisWeek,
      pendingReports,
      // top colleges
      collegeStats,
    ] = await Promise.all([
      User.countDocuments(),
      Post.countDocuments(),
      User.countDocuments({ createdAt: { $gte: today } }),
      Post.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ createdAt: { $gte: thisWeek } }),
      Post.countDocuments({ createdAt: { $gte: thisWeek } }),
      Report.countDocuments({ status: 'pending' }),
      User.aggregate([
        { $group: { _id: '$college', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
    ])

    res.json({
      totalUsers,
      totalPosts,
      usersToday,
      postsToday,
      usersThisWeek,
      postsThisWeek,
      pendingReports,
      topColleges: collegeStats.map(c => ({ college: c._id, count: c.count })),
    })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// PUT /api/posts/:id/like
// ─────────────────────────────────────────────────
router.put('/:id/like', protect, async (req, res) => {
  try {
    if (!(await visiblePost(req))) return res.status(404).json({ message: 'Post not found' })
    const post = await Post.findById(req.params.id).select('likes postedBy isAnonymous type')
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const uid          = req.user._id.toString()
    const alreadyLiked = post.likes.map(l => l.toString()).includes(uid)

    if (alreadyLiked) {
      await Post.findByIdAndUpdate(post._id,    { $pull:     { likes: req.user._id } })
      await User.findByIdAndUpdate(req.user._id, { $pull:    { likedPosts: post._id } })
    } else {
      await Post.findByIdAndUpdate(post._id,    { $addToSet: { likes: req.user._id } })
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { likedPosts: post._id } })


if (!post.isAnonymous && post.postedBy) {
  // Check if poster qualifies for contributor badge
  const posterPosts = await Post.find({ postedBy: post.postedBy })
    .select('likes').lean()

  const totalPosts = posterPosts.length
  const totalLikes = posterPosts.reduce((sum, p) => sum + (p.likes?.length || 0), 0)

  if (totalPosts >= 5 && totalLikes >= 25) {
    await User.findByIdAndUpdate(post.postedBy, { isContributor: true })
  }
}

      // Track type engagement for personalization
      const typeKey = `typeEngagement.${post.type}`
      await User.findByIdAndUpdate(req.user._id, { $inc: { [typeKey]: 1 } })

    const me = await User.findById(req.user._id).select('name year branch avatar isContributor')

if (!post.isAnonymous) {
  notify({
    recipient: post.postedBy,
    sender: req.user._id,
    type: 'post_liked',
    post: post._id,
    message: `${me?.name || 'Someone'} liked your post`
  })
}
    }

    const updated = await Post.findById(post._id).select('likes').lean()
    const likes = sanitizeLikes(updated.likes, {
      isAnonymous: post.isAnonymous,
      authorId:    post.postedBy?.toString(),
    })
    res.json({ liked: !alreadyLiked, count: updated.likes.length, likeCount: updated.likes.length, likes })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// PUT /api/posts/:id/save
// ─────────────────────────────────────────────────
router.put('/:id/save', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).select('_id').lean()
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const user         = await User.findById(req.user._id).select('savedPosts').lean()
    const alreadySaved = (user.savedPosts || []).map(id => id.toString()).includes(req.params.id)

    if (alreadySaved) {
      await User.findByIdAndUpdate(req.user._id, { $pull:     { savedPosts: post._id } })
      res.json({ saved: false })
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { savedPosts: post._id } })
      
      res.json({ saved: true })
    }
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// DELETE /api/posts/:id
// ─────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    if (!post) return res.status(404).json({ message: 'Post not found' })
    if (post.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your post' })
    }
    await post.deleteOne()
    User.updateMany({ likedPosts: post._id }, { $pull: { likedPosts: post._id } }).catch(() => {})
    User.updateMany({ savedPosts: post._id }, { $pull: { savedPosts: post._id } }).catch(() => {})
    Notification.deleteMany({ post: post._id }).catch(() => {})
    res.json({ message: 'Deleted' })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// POST /api/posts/:id/replies
// ─────────────────────────────────────────────────
router.post('/:id/replies', protect, async (req, res) => {
  try {
    const { text } = req.body

    if (!text?.trim()) {
      return res.status(400).json({ message: 'Reply text required' })
    }

    if (!(await visiblePost(req))) return res.status(404).json({ message: 'Post not found' })

    const post = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          replies: {
            text: text.trim(),
            postedBy: req.user._id,
            createdAt: new Date()
          }
        },
        $inc: { replyCount: 1 }
      },
      { new: true, runValidators: true }
    ).populate('replies.postedBy', 'name year branch avatar')

    if (!post) {
      return res.status(404).json({ message: 'Post not found' })
    }

 const newReply = post.replies[post.replies.length - 1]

// Contributor badge check
if (!post.isAnonymous && post.postedBy) {
  const posterPosts = await Post.find({ postedBy: post.postedBy })
    .select('likes')
    .lean()

  const totalPosts = posterPosts.length
  const totalLikes = posterPosts.reduce(
    (sum, p) => sum + (p.likes?.length || 0),
    0
  )

  if (totalPosts >= 5 && totalLikes >= 25) {
    await User.findByIdAndUpdate(post.postedBy, {
      isContributor: true
    })
  }
}

// Tell the author (skipped for self-replies, and by notify() for blocks)
notify({
  recipient: post.postedBy,
  sender:    req.user._id,
  type:      'post_replied',
  post:      post._id,
  message:   `${req.user.name} replied to your post`
})

return res.status(201).json(sanitizeReply(newReply, {
  isAnonymous: post.isAnonymous,
  authorId:    post.postedBy?.toString(),
}, req.user._id))

  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// DELETE /api/posts/:id/replies/:replyId
// ─────────────────────────────────────────────────
router.delete('/:id/replies/:replyId', protect, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const reply = post.replies.id(req.params.replyId)
    if (!reply) return res.status(404).json({ message: 'Reply not found' })

    if (reply.postedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not your reply' })
    }

    await Post.findByIdAndUpdate(req.params.id, {
      $pull: { replies: { _id: req.params.replyId } }
    })
    res.json({ message: 'Reply deleted' })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// ─────────────────────────────────────────────────
// POST /api/posts/:id/interested
// ─────────────────────────────────────────────────
router.post('/:id/interested', protect, async (req, res) => {
  try {
    if (!(await visiblePost(req))) return res.status(404).json({ message: 'Post not found' })
    const post = await Post.findById(req.params.id).populate('postedBy', 'name _id')
    if (!post) return res.status(404).json({ message: 'Post not found' })

    if (!['project'].includes(post.type)) {
      return res.status(400).json({ message: 'Only for partner/project posts' })
    }

    if (post.postedBy) {
      notify({
        recipient: post.postedBy._id,
        sender:    req.user._id,
        type:      'interested',
        post:      post._id,
        message:   `${req.user.name} (${req.user.year} yr ${req.user.branch}) is interested in your ${post.type} post`
      })
    }

    res.json({ message: 'Interest sent!' })
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})

// POST /api/posts/:id/report
router.post('/:id/report', protect, async (req, res) => {
  try {
    const { reason, note } = req.body
    const validReasons = ['spam','hate','harassment','misinformation','other']
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ message: 'Invalid reason' })
    }

    const post = await Post.findById(req.params.id).select('_id')
    if (!post) return res.status(404).json({ message: 'Post not found' })

    const Report = require('../models/Report')
    await Report.create({
      post:       req.params.id,
      reportedBy: req.user._id,
      reason,
      note: note?.trim() || ''
    })

    res.json({ message: 'Report submitted. Thank you.' })
  } catch (err) {
    // duplicate key = already reported
    if (err.code === 11000) {
      return res.status(400).json({ message: 'You already reported this post' })
    }
    throw err
  }
})

// POST /api/posts/:id/replies/:replyId/report { reason, note }
router.post('/:id/replies/:replyId/report', protect, async (req, res) => {
  const { reason, note } = req.body || {}
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ message: 'Invalid reason' })
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.replyId)) {
    return res.status(404).json({ message: 'Reply not found' })
  }
  const post = await Post.findById(req.params.id).select('replies._id replies.postedBy').lean()
  const reply = post?.replies?.find(r => String(r._id) === req.params.replyId)
  if (!reply) return res.status(404).json({ message: 'Reply not found' })
  if (String(reply.postedBy) === String(req.user._id)) {
    return res.status(400).json({ message: 'You cannot report your own reply' })
  }
  try {
    await Report.create({
      targetType: 'reply', post: post._id, replyId: reply._id, reportedBy: req.user._id,
      reason, note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
    })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'You already reported this reply' })
    throw err
  }
  res.json({ message: 'Report submitted. Thank you.' })
})

// ─────────────────────────────────────────────────
// GET /api/posts/:id — Public single post (share links)
// ─────────────────────────────────────────────────
router.get('/:id', protect.optional, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post id' })
    }

    const post = await Post.findById(req.params.id)
      .populate('postedBy', 'name username year branch avatar isContributor college')
      .populate('replies.postedBy', 'name year branch avatar')
      .lean()

    if (!post || (post.expiresAt && post.expiresAt < new Date())) {
      return res.status(404).json({ message: 'Post not found' })
    }

    // Logged-in viewers don't see posts hidden by a block (checked on the real author)
    const sets = req.user ? await getBlockSets(req.user) : null
    if (isPostHidden(post, sets)) return res.status(404).json({ message: 'Post not found' })

    res.json(sanitizePost(post, req.user?._id, sets))
  } catch (err) {
    throw err   // errorHandler: validation/cast errors -> 400, anything else -> 500
  }
})


module.exports = router
