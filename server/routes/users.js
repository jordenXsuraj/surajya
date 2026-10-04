

const express      = require('express')
const mongoose     = require('mongoose')
const router       = express.Router()
const { Expo }     = require('expo-server-sdk')
const { rateLimit } = require('express-rate-limit')
const User         = require('../models/User')
const Post         = require('../models/Post')
const Report       = require('../models/Report')
const protect      = require('../middleware/auth')
const { sanitizePost } = require('../utils/sanitizePost')
const { getBlockSets, addPostBlockFilter, isBlockedEitherWay } = require('../utils/blocks')
const { notify }   = require('../services/notify')
const { deleteAccount } = require('../services/accountDeletion')
const { upload }   = require('../config/cloudinary')

const REPORT_REASONS = ['spam','hate','harassment','misinformation','other']

// Wrong password on account deletion: 5 tries per 15 min per user
const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit:    5,
  keyGenerator: req => `user:${req.user._id}`,
  message:  { message: 'Too many attempts. Try again in 15 minutes.' },
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
})

// 404 for a profile hidden by a block in either direction (also for bad ids)
async function profileVisible(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ message: 'User not found' })
    return null
  }
  const sets = await getBlockSets(req.user)
  if (isBlockedEitherWay(sets, req.params.id)) {
    res.status(404).json({ message: 'User not found' })
    return null
  }
  return sets
}

function collegeRegex(college) {
  return {
    $regex: new RegExp(
      '^' + college.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
      'i'
    )
  }
}

function safeUser(u) {
  const obj = u.toObject ? u.toObject({ virtuals: true }) : { ...u }
  delete obj.password
  delete obj.pushTokens
  delete obj.tokenVersion
  delete obj.__v
  obj.followingCount = obj.following?.length || 0
  obj.followerCount  = obj.followers?.length || 0
  return obj
}

// ─────────────────────────────────────────────────
// GET /api/users/me
// ─────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -__v')
      .populate('following',       'name year branch skills college avatar')
      .populate('pendingRequests', 'name year branch skills college avatar')
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(safeUser(user))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// DELETE /api/users/me { password } — permanent account deletion
// ─────────────────────────────────────────────────
router.delete('/me', protect, deleteAccountLimiter, async (req, res) => {
  const { password } = req.body || {}
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Password is required' })
  }
  const user = await User.findById(req.user._id).select('+password')
  if (!user || !(await user.matchPassword(password))) {
    return res.status(400).json({ message: 'Incorrect password' })   // 400, not 401: the session is fine
  }
  await deleteAccount(user._id)
  res.status(204).end()
})

// ─────────────────────────────────────────────────
// POST /api/users/me/accept-terms — for accounts created before terms existed
// ─────────────────────────────────────────────────
router.post('/me/accept-terms', protect, async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id, { $set: { termsAcceptedAt: new Date() } }, { returnDocument: 'after' }
  ).select('termsAcceptedAt')
  res.json({ termsAcceptedAt: user.termsAcceptedAt })
})

// ─────────────────────────────────────────────────
// Push tokens (mobile). Never returned by any endpoint.
// POST   /api/users/me/push-token { token, platform, deviceId }
// DELETE /api/users/me/push-token { deviceId }   (call on logout)
// ─────────────────────────────────────────────────
router.post('/me/push-token', protect, async (req, res) => {
  const { token, platform, deviceId } = req.body || {}
  if (!Expo.isExpoPushToken(token)) return res.status(400).json({ message: 'Invalid Expo push token' })
  if (!['ios', 'android'].includes(platform)) return res.status(400).json({ message: "platform must be 'ios' or 'android'" })
  if (typeof deviceId !== 'string' || !deviceId.trim() || deviceId.length > 200) {
    return res.status(400).json({ message: 'deviceId is required' })
  }
  const id = deviceId.trim()

  // A token belongs to one device and one account: if another account still
  // has it (same phone, different login), it must stop receiving our pushes.
  await User.updateMany({ _id: { $ne: req.user._id }, 'pushTokens.token': token }, { $pull: { pushTokens: { token } } })
  await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: { deviceId: id } } })
  await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: { token } } })
  await User.updateOne({ _id: req.user._id }, {
    $push: { pushTokens: { $each: [{ token, platform, deviceId: id, updatedAt: new Date() }], $slice: -10 } },
  })
  res.json({ ok: true })
})

router.delete('/me/push-token', protect, async (req, res) => {
  const deviceId = req.body?.deviceId ?? req.query.deviceId
  if (typeof deviceId !== 'string' || !deviceId.trim()) return res.status(400).json({ message: 'deviceId is required' })
  await User.updateOne({ _id: req.user._id }, { $pull: { pushTokens: { deviceId: deviceId.trim() } } })
  res.json({ ok: true })
})

// ─────────────────────────────────────────────────
// GET /api/users/me/blocked
// ─────────────────────────────────────────────────
router.get('/me/blocked', protect, async (req, res) => {
  const me = await User.findById(req.user._id)
    .select('blockedUsers')
    .populate('blockedUsers', 'name username avatar')
    .lean()
  res.json(me?.blockedUsers || [])
})

// ─────────────────────────────────────────────────
// PUT /api/users/me
// ─────────────────────────────────────────────────
router.put('/me', protect, async (req, res) => {
  try {
    
const { name, bio, year, branch, skills, projects, roadmap, youtubeUrl, mediaItems, username } = req.body
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ message: 'Name cannot be empty' })
    }
    const updates = {}
    if (name     !== undefined) updates.name     = name.trim()
    if (bio      !== undefined) updates.bio      = bio.trim().slice(0, 250)
    if (year     !== undefined) updates.year     = year
    if (branch   !== undefined) updates.branch   = branch.trim()
    if (roadmap  !== undefined) updates.roadmap  = roadmap.trim()


if (username !== undefined) {
  const clean = username.toLowerCase().trim().replace(/[^a-z0-9_.]/g, '')
  if (clean.length < 3) return res.status(400).json({ message: 'Username too short' })
  if (clean.length > 20) return res.status(400).json({ message: 'Username too long' })
  // Check uniqueness
  const taken = await User.findOne({ username: clean, _id: { $ne: req.user._id } })
  if (taken) return res.status(400).json({ message: 'Username already taken' })
  updates.username = clean
}

if (youtubeUrl  !== undefined) updates.youtubeUrl  = youtubeUrl.trim()
if (mediaItems  !== undefined) updates.mediaItems  = Array.isArray(mediaItems)
  ? mediaItems.filter(m => m.url?.trim() && ['youtube','instagram'].includes(m.type))
      .map(m => ({ type: m.type, url: m.url.trim() }))
  : []


    if (skills   !== undefined) updates.skills   = Array.isArray(skills) ? skills : []
    if (projects !== undefined) {
      updates.projects = projects
        .filter(p => p.name?.trim())
        .map(p => ({ name: p.name.trim(), link: p.link?.trim() || '' }))
    }
    const updated = await User.findByIdAndUpdate(
      req.user._id, { $set: updates }, {   returnDocument: 'after', runValidators: true }
    ).select('-password -__v')
    res.json(safeUser(updated))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// POST /api/users/me/avatar
// ─────────────────────────────────────────────────
router.post('/me/avatar', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image provided' })
    const updated = await User.findByIdAndUpdate(
      req.user._id, { $set: { avatar: req.file.path } }, { new: true }
    ).select('-password -__v')
    res.json({ avatar: req.file.path, user: safeUser(updated) })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// POST /api/users/me/cover
// ─────────────────────────────────────────────────
router.post('/me/cover', protect, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No image provided' })
    const updated = await User.findByIdAndUpdate(
      req.user._id, { $set: { coverImage: req.file.path } }, { new: true }
    ).select('-password -__v')
    res.json({ coverImage: req.file.path, user: safeUser(updated) })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/me/posts
// ─────────────────────────────────────────────────
router.get('/me/posts', protect, async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1
    const limit = parseInt(req.query.limit) || 20
    const skip  = (page - 1) * limit

    const sets  = await getBlockSets(req.user)
    const posts = await Post.find({ postedBy: req.user._id })
      .populate({
        path: 'replies.postedBy',
        select: 'name year branch avatar',
        options: { limit: 5 }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
    res.json(posts.map(p => sanitizePost(p, req.user._id, sets)))
  } catch (err) {
    res.status(500).json({ message: 'Server error. Please try again.' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/me/saved
// ─────────────────────────────────────────────────
router.get('/me/saved', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('savedPosts').lean()
    if (!user?.savedPosts?.length) return res.json([])
    const sets  = await getBlockSets(req.user)
    const posts = await Post.find(addPostBlockFilter({ _id: { $in: user.savedPosts } }, sets))
      .populate('postedBy', 'name year branch college avatar')
      .populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }
})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
    res.json(posts.map(p => sanitizePost(p, req.user._id, sets)))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/requests
// ─────────────────────────────────────────────────
router.get('/requests', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('pendingRequests', 'name year branch skills college bio avatar')
      .lean()
    res.json(user.pendingRequests || [])
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/following — MY following list
// ─────────────────────────────────────────────────
router.get('/following', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('following', 'name year branch skills college bio avatar projects')
      .lean()
    res.json(user.following || [])
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/followers — MY followers list
// ─────────────────────────────────────────────────
router.get('/followers', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('followers', 'name year branch skills college bio avatar')
      .lean()
    res.json(user.followers || [])
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/suggestions
// ─────────────────────────────────────────────────
router.get('/suggestions', protect, async (req, res) => {
  try {
    const me = await User.findById(req.user._id)
      .select('college branch year skills following sentRequests followers')
      .lean()

    if (!me) return res.json([])

    const myFollowingIds = (me.following    || []).map(id => id.toString())
    const mySentIds      = (me.sentRequests || []).map(id => id.toString())
    const sets           = await getBlockSets(req.user)
    const excludeIds     = [req.user._id.toString(), ...myFollowingIds, ...mySentIds, ...sets.all]

    const candidates = await User.find({
      college: me.college,
      _id: { $nin: excludeIds }
    })
      .select('name username year branch skills college bio avatar following followers projects isContributor')
      .limit(35)
      .lean()

    const scored = candidates.map(u => {
      let score = 0
      const theyFollowMe = (u.following || []).some(id => id.toString() === req.user._id.toString())
      if (theyFollowMe)  score += 50
      if (u.branch === me.branch) score += 30
      if (u.year   === me.year)   score += 20
      const mySkillSet = new Set((me.skills || []).map(s => s.toLowerCase()))
      const overlap = (u.skills || []).filter(s => mySkillSet.has(s.toLowerCase())).length
      score += overlap * 8
      score += Math.min((u.followers?.length || 0) * 2, 20)
    //  score += Math.random() * 5
      return { ...u, _score: score }
    })

    scored.sort((a, b) => b._score - a._score)

    const result = scored.slice(0, 20).map(u => {
      const { _score, ...rest } = u
      rest.followingCount = rest.following?.length || 0
      rest.followerCount  = rest.followers?.length || 0
      delete rest.following
      delete rest.followers
      rest.requestSent = mySentIds.includes(u._id.toString())
      rest.isFollowing = myFollowingIds.includes(u._id.toString())
      return rest
    })

    res.json(result)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users — Campus students list (Connect page)
// ─────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
const { skill, search } = req.query
const sets   = await getBlockSets(req.user)
const filter = { college: collegeRegex(req.user.college), _id: { $nin: [req.user._id, ...sets.allIds] } }

if (skill && skill !== 'All' && skill.trim()) {
  filter.skills = { $elemMatch: { $regex: skill.trim(), $options: 'i' } }
}

// Search by name OR username
if (search && search.trim()) {
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  filter.$or = [
    { name:     { $regex: escaped, $options: 'i' } },
    { username: { $regex: escaped, $options: 'i' } },
  ]
}

const page  = parseInt(req.query.page)  || 1
const limit = 20
const skip  = (page - 1) * limit

const users = await User.find(filter)
  .select('name username year branch bio skills projects following followers sentRequests college avatar coverImage isContributor')
  .sort({ year: -1, createdAt: -1 })
  .skip(skip)
  .limit(limit)
  .lean()

    const myFollowing = (req.user.following    || []).map(id => id.toString())
    const mySent      = (req.user.sentRequests || []).map(id => id.toString())

    res.json(users.map(u => ({
      _id:            u._id,
      name:           u.name,
       username:       u.username || '',
      year:           u.year,
      branch:         u.branch,
      bio:            u.bio || '',
      skills:         u.skills || [],
      projects:       u.projects || [],
      college:        u.college,
      avatar:         u.avatar || '',
      isSenior:       u.year === '4th',
      followingCount: u.following?.length || 0,
      followerCount:  u.followers?.length || 0,
      isFollowing:    myFollowing.includes(u._id.toString()),
      requestSent:    mySent.includes(u._id.toString()),
      isContributor: u.isContributor || false,
    })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})




router.get('/all', protect, async (req, res) => {
  try {
    const { skill, search } = req.query
    const page  = parseInt(req.query.page)  || 1
    const limit = 20
    const skip  = (page - 1) * limit

    const sets   = await getBlockSets(req.user)
    const filter = { _id: { $nin: [req.user._id, ...sets.allIds] } }

    // Skill filter
    if (skill && skill !== 'All' && skill.trim()) {
      filter.skills = { $elemMatch: { $regex: skill.trim(), $options: 'i' } }
    }

    // Search by name OR username
   if (search && search.trim()) {
  const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  filter.$or = [
    { name:     { $regex: escaped, $options: 'i' } },
    { username: { $regex: escaped, $options: 'i' } },
  ]
}

    const users = await User.find(filter)
      .select('name username year branch bio skills projects following followers sentRequests college avatar isContributor')
      .sort({ year: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()

    const myFollowing = (req.user.following    || []).map(id => id.toString())
    const mySent      = (req.user.sentRequests || []).map(id => id.toString())

    res.json(users.map(u => ({
      _id:            u._id,
      name:           u.name,
      username:       u.username || '',
      year:           u.year,
      branch:         u.branch,
      bio:            u.bio || '',
      skills:         u.skills || [],
      projects:       u.projects || [],
      college:        u.college,
      avatar:         u.avatar || '',
      isSenior:       u.year === '4th',
      followingCount: u.following?.length || 0,
      followerCount:  u.followers?.length || 0,
      isFollowing:    myFollowing.includes(u._id.toString()),
      requestSent:    mySent.includes(u._id.toString()),
      isContributor: u.isContributor || false,
    })))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})


// ─────────────────────────────────────────────────
// POST /api/users/:id/connect — Send follow request
// ─────────────────────────────────────────────────
router.post('/:id/connect', protect, async (req, res) => {
  try {
    const targetId = req.params.id
    const myId     = req.user._id.toString()

    if (targetId === myId) return res.status(400).json({ message: 'Cannot follow yourself' })

    if (!mongoose.isValidObjectId(targetId)) return res.status(404).json({ message: 'User not found' })
    const target = await User.findById(targetId)
    if (!target) return res.status(404).json({ message: 'User not found' })

    // No follow requests between users who blocked each other (either way)
    if (isBlockedEitherWay(await getBlockSets(req.user), targetId)) {
      return res.status(403).json({ message: 'You cannot follow this user' })
    }

      /*
    const alreadyFollowing = (req.user.following    || []).map(c => c.toString()).includes(targetId)
    if (alreadyFollowing) return res.status(400).json({ message: 'Already following' })

    const alreadySent = (req.user.sentRequests || []).map(s => s.toString()).includes(targetId)
    if (alreadySent) return res.status(400).json({ message: 'Request already sent' })
*/

const alreadyFollowing = (req.user.following || []).map(c => c.toString()).includes(targetId)
if (alreadyFollowing) return res.status(400).json({ message: 'Already following' })

const alreadySent = (req.user.sentRequests || []).map(s => s.toString()).includes(targetId)
if (alreadySent) return res.status(400).json({ message: 'Request already sent' })

const alreadyPending = (req.user.pendingRequests || []).map(p => p.toString()).includes(targetId)
if (alreadyPending) return res.status(400).json({ message: 'User already requested you' })

await Promise.all([
    User.findByIdAndUpdate(myId,     { $addToSet: { sentRequests:    targetId } }),
    User.findByIdAndUpdate(targetId, { $addToSet: { pendingRequests: myId     } })
     ])
notify({
  recipient: targetId,
  sender:    req.user._id,
  type:      'connection_request',
  message:   `${req.user.name} wants to follow you`
})
    res.json({ message: `Follow request sent to ${target.name}` })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// POST /api/users/:id/accept — Accept follow request
// ─────────────────────────────────────────────────
/*
router.post('/:id/accept', protect, async (req, res) => {
  try {
    const senderId = req.params.id
    const myId     = req.user._id.toString()

    const sender = await User.findById(senderId)
    if (!sender) return res.status(404).json({ message: 'User not found' })

    const hasPending = (req.user.pendingRequests || []).map(p => p.toString()).includes(senderId)
    if (!hasPending) return res.status(400).json({ message: 'No pending request from this user' })

    // Sender now follows me (acceptor)
    await User.findByIdAndUpdate(senderId, {
      $addToSet: { following: myId },
      $pull:     { sentRequests: myId }
    })
    await User.findByIdAndUpdate(myId, {
      $addToSet: { followers: senderId },
      $pull:     { pendingRequests: senderId }
    })

    await Notification.create({
      recipient: senderId,
      sender:    req.user._id,
      type:      'connection_accepted',
      message:   `${req.user.name} accepted your follow request`
    }).catch(() => {})

    res.json({ message: `${sender.name} now follows you` })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})
*/


router.post('/:id/accept', protect, async (req, res) => {
  try {
    const senderId = req.params.id
    const myId     = req.user._id.toString()

    const sender = await User.findById(senderId)
    if (!sender) return res.status(404).json({ message: 'User not found' })

    const hasPending = (req.user.pendingRequests || []).map(p => p.toString()).includes(senderId)
    if (!hasPending) return res.status(400).json({ message: 'No pending request' })

    // ✅ BOTH SIDES UPDATE (IMPORTANT)
    await User.findByIdAndUpdate(senderId, {
      $addToSet: { following: myId },
      $pull:     { sentRequests: myId }
    })

    await User.findByIdAndUpdate(myId, {
      $addToSet: { followers: senderId },
      $pull:     { pendingRequests: senderId }
    })

    notify({
      recipient: senderId,
      sender:    req.user._id,
      type:      'connection_accepted',
      message:   `${req.user.name} accepted your Connect request`
    })

    res.json({ message: 'Request accepted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})



// ─────────────────────────────────────────────────
// POST /api/users/:id/reject
// ─────────────────────────────────────────────────
router.post('/:id/reject', protect, async (req, res) => {
  try {
    const senderId = req.params.id
    const myId     = req.user._id.toString()
    await User.findByIdAndUpdate(myId,     { $pull: { pendingRequests: senderId } })
    await User.findByIdAndUpdate(senderId, { $pull: { sentRequests: myId } })
    res.json({ message: 'Request removed' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// POST /api/users/:id/unfollow
// ─────────────────────────────────────────────────
router.post('/:id/unfollow', protect, async (req, res) => {
  try {
    const targetId = req.params.id
    const myId     = req.user._id.toString()
    await User.findByIdAndUpdate(myId,     { $pull: { following: targetId } })
    await User.findByIdAndUpdate(targetId, { $pull: { followers: myId } })
    res.json({ message: 'Unfollowed' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id/posts — Public posts by user
// ─────────────────────────────────────────────────
router.get('/:id/posts', protect, async (req, res) => {
  try {
    const sets = await profileVisible(req, res)
    if (!sets) return
    const posts = await Post.find({ postedBy: req.params.id, isAnonymous: false })
      .populate('postedBy', 'name year branch college avatar')
      .populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }
})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()

      posts.forEach(p => {
  if (p.replies) {
    p.replies = p.replies.slice(0, 5)
  }
})

    res.json(posts.map(p => sanitizePost(p, req.user._id, sets)))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id/connections — People this user follows (alias)
// ─────────────────────────────────────────────────
router.get('/:id/connections', protect, async (req, res) => {
  try {
    const sets = await profileVisible(req, res)
    if (!sets) return
    const user = await User.findById(req.params.id)
      .populate('following', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json((user.following || []).filter(u => !sets.all.has(String(u._id))))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id/following — People this user follows
// FIX: was missing — StudentProfile couldn't load following list
// ─────────────────────────────────────────────────
router.get('/:id/following', protect, async (req, res) => {
  try {
    const sets = await profileVisible(req, res)
    if (!sets) return
    const user = await User.findById(req.params.id)
      .populate('following', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json((user.following || []).filter(u => !sets.all.has(String(u._id))))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id/followers — People who follow this user
// FIX: was missing — StudentProfile followers tab was always empty
// ─────────────────────────────────────────────────
router.get('/:id/followers', protect, async (req, res) => {
  try {
    const sets = await profileVisible(req, res)
    if (!sets) return
    const user = await User.findById(req.params.id)
      .populate('followers', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json((user.followers || []).filter(u => !sets.all.has(String(u._id))))
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id — Public profile
// FIX: now returns followerCount and followingCount correctly
// ─────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    if (!(await profileVisible(req, res))) return
    // Email, blocks, push tokens and sessions are private: only returned via /me and auth responses
    const user = await User.findById(req.params.id)
      .select('-password -email -__v -likedPosts -savedPosts -pendingRequests -sentRequests -blockedUsers -pushTokens -tokenVersion -termsAcceptedAt')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })

    // FIX: compute counts BEFORE deleting arrays
    const followingCount = user.following?.length || 0
    const followerCount  = user.followers?.length || 0

    // Remove arrays from response (privacy — don't expose full lists here)
    delete user.following
    delete user.followers

    res.json({ ...user, followingCount, followerCount })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// POST /api/users/:id/block — also ends follow relations both ways
// POST /api/users/:id/unblock
// ─────────────────────────────────────────────────
router.post('/:id/block', protect, async (req, res) => {
  const targetId = req.params.id
  if (!mongoose.isValidObjectId(targetId)) return res.status(404).json({ message: 'User not found' })
  if (targetId === req.user._id.toString()) return res.status(400).json({ message: 'You cannot block yourself' })
  const target = await User.findById(targetId).select('_id').lean()
  if (!target) return res.status(404).json({ message: 'User not found' })

  const relations = id => ({ following: id, followers: id, pendingRequests: id, sentRequests: id })
  await Promise.all([
    User.updateOne({ _id: req.user._id }, { $addToSet: { blockedUsers: target._id }, $pull: relations(target._id) }),
    User.updateOne({ _id: target._id },   { $pull: relations(req.user._id) }),
  ])
  res.json({ message: 'User blocked', blocked: true })
})

router.post('/:id/unblock', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' })
  await User.updateOne({ _id: req.user._id }, { $pull: { blockedUsers: req.params.id } })
  res.json({ message: 'User unblocked', blocked: false })
})

// ─────────────────────────────────────────────────
// POST /api/users/:id/report { reason, note }
// ─────────────────────────────────────────────────
router.post('/:id/report', protect, async (req, res) => {
  const { reason, note } = req.body || {}
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ message: 'Invalid reason' })
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: 'User not found' })
  if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'You cannot report yourself' })
  const target = await User.findById(req.params.id).select('_id').lean()
  if (!target) return res.status(404).json({ message: 'User not found' })
  try {
    await Report.create({
      targetType: 'user', user: target._id, reportedBy: req.user._id,
      reason, note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
    })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'You already reported this user' })
    throw err
  }
  res.json({ message: 'Report submitted. Thank you.' })
})

module.exports = router
