

const express      = require('express')
const router       = express.Router()
const User         = require('../models/User')
const Post         = require('../models/Post')
const Notification = require('../models/Notification')
const protect      = require('../middleware/auth')
const { upload }   = require('../config/cloudinary')

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
    const posts = await Post.find({ postedBy: req.user._id })
      .populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }
})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean()
    res.json(posts)
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
    const posts = await Post.find({ _id: { $in: user.savedPosts } })
      .populate('postedBy', 'name year branch college avatar')
      .populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }
})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()
    res.json(posts.map(p => { if (p.isAnonymous) p.postedBy = null; return p }))
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
    const excludeIds     = [req.user._id.toString(), ...myFollowingIds, ...mySentIds]

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
const filter = { college: collegeRegex(req.user.college), _id: { $ne: req.user._id } }

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

    const filter = { _id: { $ne: req.user._id } }

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

    const target = await User.findById(targetId)
    if (!target) return res.status(404).json({ message: 'User not found' })

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
if (targetId.toString() !== req.user._id.toString()) {
   await Notification.create({
  recipient: targetId,
  sender:    req.user._id,
  type:      'connection_request',
  message:   `${req.user.name} wants to follow you`
}).catch(() => {})
  }
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

   await Notification.create({
      recipient: senderId,
      sender:    req.user._id,
      type:      'connection_accepted',
      message:   `${req.user.name} accepted your Connect request`
    }).catch(() => {})

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
    const posts = await Post.find({ postedBy: req.params.id, isAnonymous: false })
      .populate('postedBy', 'name year branch college avatar')
      .populate({
  path: 'replies.postedBy',
  select: 'name year branch avatar',
  options: { limit: 5 }
})
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()

      posts.forEach(p => {
  if (p.replies) {
    p.replies = p.replies.slice(0, 5)
  }
})

    res.json(posts)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ─────────────────────────────────────────────────
// GET /api/users/:id/connections — People this user follows (alias)
// ─────────────────────────────────────────────────
router.get('/:id/connections', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('following', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user.following || [])
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
    const user = await User.findById(req.params.id)
      .populate('following', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user.following || [])
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
    const user = await User.findById(req.params.id)
      .populate('followers', 'name year branch skills college avatar')
      .lean()
    if (!user) return res.status(404).json({ message: 'User not found' })
    res.json(user.followers || [])
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
    const user = await User.findById(req.params.id)
      .select('-password -__v -likedPosts -savedPosts -pendingRequests -sentRequests')
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

module.exports = router
