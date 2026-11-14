// MeetNow: temporary meetups with a group chat (web first; server/API_MOBILE.md, "MeetNow").
// Behind the `meetnow` feature switch (config/features.js): while it is off for this account every
// route here is the ordinary 404. An expired or ended meetup is a 404 too, from the second it
// expires, whatever is still in the database (services/meetupLifecycle.js deletes it).

const express = require('express')
const { rateLimit } = require('express-rate-limit')
const protect = require('../middleware/auth')
const requireVerifiedEmail = require('../middleware/requireVerifiedEmail')
const validObjectIdParam = require('../middleware/validObjectId')
const { requireFeature } = require('../config/features')
const Meetup = require('../models/Meetup')
const MeetupMember = require('../models/MeetupMember')
const MeetupMessage = require('../models/MeetupMessage')
const Report = require('../models/Report')
const { getBlockSets, isBlockedEitherWay, str } = require('../utils/blocks')
const { hasProfanity, PROFANITY } = require('../utils/moderation')
const realtime = require('../realtime/socket')
const life = require('../services/meetupLifecycle')

const router = express.Router()
router.use(requireFeature('meetnow'))
router.use(protect)
for (const name of ['id', 'messageId']) router.param(name, validObjectIdParam)

const REPORT_REASONS = ['spam', 'hate', 'harassment', 'misinformation', 'other']
const REPORT_DAYS = 90
const PEOPLE = 'name username avatar college year branch'

const perUser = (windowMs, limit, message, extra = {}) => rateLimit({
  windowMs, limit, ...extra,
  keyGenerator: req => `user:${req.user._id}`,
  message: { code: 'RATE_LIMITED', message },
  standardHeaders: 'draft-7', legacyHeaders: false,
})
// counts MeetNows actually started (refused attempts don't use up the day's budget)
const createLimiter  = perUser(24 * 3600e3, 10, 'You can start up to 10 MeetNows a day.', { skipFailedRequests: true })
const joinLimiter    = perUser(10 * 60e3, 60, 'Too many joins. Try again in a few minutes.')
const messageLimiter = perUser(60e3, 20, 'You are sending messages too fast. Wait a moment.')
const reportLimiter  = perUser(3600e3, 20, 'Too many reports. Try again later.')

const gone = res => res.status(404).json({ code: 'MEETUP_NOT_FOUND', message: 'This MeetNow has ended.' })

// Who may see a meetup: everyone-meetups, their own college's, and their own; never across a block
const visibleTo = user => ({ $or: [{ visibility: 'everyone' }, { visibility: 'college', college: user.college }, { creator: user._id }] })

async function loadVisible(req) {
  const sets = await getBlockSets(req.user)
  const meetup = await Meetup.findOne({ _id: req.params.id, ...life.active(), ...visibleTo(req.user) })
    .populate('creator', PEOPLE).lean()
  if (!meetup || !meetup.creator || isBlockedEitherWay(sets, meetup.creator._id)) return { sets }
  return { meetup, sets }
}

function card(m, { joined }, me) {
  return {
    _id: m._id, title: m.title, category: m.category, location: m.location, visibility: m.visibility,
    memberCount: m.memberCount, expiresAt: m.expiresAt, createdAt: m.createdAt,
    endsWhenCreatorLeaves: m.endsWhenCreatorLeaves,
    creator: m.creator && { _id: m.creator._id, name: m.creator.name, username: m.creator.username, avatar: m.creator.avatar || '', college: m.creator.college, year: m.creator.year, branch: m.creator.branch },
    joined, isCreator: str(m.creator?._id ?? m.creator) === str(me._id),
  }
}

function cleanText(v, max) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max + 1) : ''
}

// ── GET /api/meetups?category=&limit= — active meetups this user can see (own/joined first) ──
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50)
  const sets = await getBlockSets(req.user)
  const filter = { ...life.active(), ...visibleTo(req.user), creator: { $nin: sets.allIds } }
  if (Meetup.CATEGORIES.includes(req.query.category)) filter.category = req.query.category
  // The creator's own meetups pass the visibility $or; keep the block filter on top of it
  const meetups = await Meetup.find(filter).sort({ createdAt: -1 }).limit(limit).populate('creator', PEOPLE).lean()
  const mine = new Set((await MeetupMember.find({ user: req.user._id, meetup: { $in: meetups.map(m => m._id) } }).select('meetup').lean()).map(m => str(m.meetup)))
  const list = meetups.filter(m => m.creator).map(m => card(m, { joined: mine.has(str(m._id)) }, req.user))
  list.sort((a, b) => Number(b.joined) - Number(a.joined))   // stable: newest first within each group
  res.set('Cache-Control', 'private, no-store')
  res.json(list)
})

// ── POST /api/meetups — start one ─────────────────
router.post('/', requireVerifiedEmail, createLimiter, async (req, res) => {
  const b = req.body || {}
  const title = cleanText(b.title, 80)
  const description = cleanText(b.description, 300)
  const location = cleanText(b.location, 80)
  if (title.length < 3 || title.length > 80) return res.status(400).json({ message: 'Give it a title (3–80 characters)' })
  if (description.length > 300) return res.status(400).json({ message: 'Description is too long (max 300 characters)' })
  if (location.length < 2 || location.length > 80) return res.status(400).json({ message: 'Say where (2–80 characters)' })
  if (!Meetup.CATEGORIES.includes(b.category)) return res.status(400).json({ message: 'Choose a category' })
  if (!Meetup.VISIBILITY.includes(b.visibility)) return res.status(400).json({ message: 'Choose who can join' })
  if (hasProfanity(title, description, location)) return res.status(400).json({ ...PROFANITY, message: 'Please keep it respectful.' })
  const expiry = life.resolveExpiry(b)
  if (expiry.error) return res.status(400).json({ message: expiry.error })
  if (await Meetup.countDocuments({ creator: req.user._id, ...life.active() }) >= life.MAX_ACTIVE_PER_CREATOR) {
    return res.status(429).json({ code: 'TOO_MANY_ACTIVE', message: `You can have up to ${life.MAX_ACTIVE_PER_CREATOR} active MeetNows. End one first.` })
  }
  const meetup = await life.createMeetup(req.user, {
    title, description, location, category: b.category, visibility: b.visibility,
    expiresAt: expiry.expiresAt, endsWhenCreatorLeaves: expiry.endsWhenCreatorLeaves,
  })
  res.status(201).json(card({ ...meetup, creator: req.user }, { joined: true }, req.user))
})

// ── GET /api/meetups/:id — details and members ────
router.get('/:id', async (req, res) => {
  const { meetup, sets } = await loadVisible(req)
  if (!meetup) return gone(res)
  const members = await MeetupMember.find({ meetup: meetup._id }).sort({ joinedAt: 1 }).limit(life.MAX_MEMBERS)
    .populate('user', PEOPLE).lean()
  const joined = members.some(m => str(m.user?._id) === str(req.user._id))
  res.set('Cache-Control', 'private, no-store')
  res.json({
    ...card(meetup, { joined }, req.user),
    description: meetup.description,
    // People either side blocked are left out of the list (the count still includes them)
    members: members.filter(m => m.user && !isBlockedEitherWay(sets, m.user._id)).map(m => ({
      _id: m.user._id, name: m.user.name, username: m.user.username, avatar: m.user.avatar || '',
      college: m.user.college, year: m.user.year, branch: m.user.branch,
      isCreator: str(m.user._id) === str(meetup.creator._id), joinedAt: m.joinedAt,
    })),
  })
})

// ── POST /api/meetups/:id/join — idempotent ───────
router.post('/:id/join', requireVerifiedEmail, joinLimiter, async (req, res) => {
  const { meetup } = await loadVisible(req)
  if (!meetup) return gone(res)
  const result = await life.joinMeetup(meetup._id, req.user)
  if (result.status === 'gone') return gone(res)
  if (result.status === 'full') return res.status(409).json({ code: 'MEETUP_FULL', message: 'This MeetNow is full.' })
  res.json({ joined: true, alreadyJoined: result.status === 'already', memberCount: result.meetup.memberCount })
})

// ── POST /api/meetups/:id/leave ───────────────────
router.post('/:id/leave', async (req, res) => {
  const meetup = await Meetup.findOne({ _id: req.params.id, ...life.active() }).lean()
  if (!meetup) return gone(res)
  const result = await life.leaveMeetup(meetup, req.user)
  if (!result.left) return res.status(400).json({ code: 'NOT_A_MEMBER', message: 'You are not in this MeetNow.' })
  res.json(result)
})

// ── DELETE /api/meetups/:id — the creator ends it now ──
router.delete('/:id', async (req, res) => {
  const meetup = await Meetup.findOne({ _id: req.params.id, ...life.active() }).select('creator').lean()
  if (!meetup) return gone(res)
  if (str(meetup.creator) !== str(req.user._id)) return res.status(403).json({ message: 'Only the creator can end this MeetNow.' })
  await life.endMeetup(meetup._id, 'ended')
  res.json({ ended: true })
})

// Members of an active meetup only
async function memberOf(req, res) {
  const meetup = await Meetup.findOne({ _id: req.params.id, ...life.active() }).lean()
  if (!meetup) { gone(res); return null }
  if (!(await MeetupMember.exists({ meetup: meetup._id, user: req.user._id }))) {
    res.status(403).json({ code: 'NOT_A_MEMBER', message: 'Join this MeetNow to see the chat.' })
    return null
  }
  return meetup
}

// ── GET /api/meetups/:id/messages?before=<ISO date>&limit= — oldest first ──
router.get('/:id/messages', async (req, res) => {
  const meetup = await memberOf(req, res)
  if (!meetup) return
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100)
  const before = req.query.before ? new Date(String(req.query.before)) : null
  const filter = { meetup: meetup._id }
  if (before && !Number.isNaN(before.getTime())) filter.createdAt = { $lt: before }
  const sets = await getBlockSets(req.user)
  const rows = await MeetupMessage.find(filter).sort({ createdAt: -1 }).limit(limit).populate('sender', 'name avatar').lean()
  res.set('Cache-Control', 'private, no-store')
  res.json(rows.reverse().map(m => {
    const out = life.serializeMessage(m)
    return m.kind === 'text' && m.sender && isBlockedEitherWay(sets, m.sender._id) ? { ...out, text: null, hidden: true } : out
  }))
})

// ── POST /api/meetups/:id/messages { text } ───────
router.post('/:id/messages', requireVerifiedEmail, messageLimiter, async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(400).json({ message: 'Message is empty' })
  if (text.length > 1000) return res.status(400).json({ message: 'Message is too long (max 1000 characters)' })
  if (hasProfanity(text)) return res.status(400).json({ ...PROFANITY, message: 'Please keep it respectful.' })
  const meetup = await memberOf(req, res)
  if (!meetup) return
  const msg = await MeetupMessage.create({ meetup: meetup._id, sender: req.user._id, kind: 'text', text, expiresAt: meetup.expiresAt })
  // Ended while we were writing? Then this message must not survive it
  if (!(await Meetup.exists({ _id: meetup._id, ...life.active() }))) {
    await MeetupMessage.deleteOne({ _id: msg._id })
    return gone(res)
  }
  const out = life.serializeMessage(msg.toObject(), req.user)
  await realtime.meetupMessage(str(meetup._id), out)
  res.status(201).json(out)
})

// ── Reports (snapshot kept 90 days: the meetup itself will be deleted) ──
function reportInput(req, res) {
  const { reason, note } = req.body || {}
  if (!REPORT_REASONS.includes(reason)) { res.status(400).json({ message: 'Invalid reason' }); return null }
  return { reason, note: typeof note === 'string' ? note.trim().slice(0, 300) : '' }
}
async function fileReport(res, doc, duplicateMessage) {
  try {
    await Report.create({ ...doc, expiresAt: new Date(Date.now() + REPORT_DAYS * 864e5) })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: duplicateMessage })
    throw err
  }
  res.json({ message: 'Report submitted. Thank you.' })
}

// POST /api/meetups/:id/report { reason, note }
router.post('/:id/report', requireVerifiedEmail, reportLimiter, async (req, res) => {
  const input = reportInput(req, res)
  if (!input) return
  const { meetup } = await loadVisible(req)
  if (!meetup) return gone(res)
  if (str(meetup.creator._id) === str(req.user._id)) return res.status(400).json({ message: 'You cannot report your own MeetNow' })
  await fileReport(res, {
    targetType: 'meetup', meetup: meetup._id, reportedBy: req.user._id, ...input,
    snapshot: { title: meetup.title, text: meetup.description || meetup.location, sender: meetup.creator._id, senderName: meetup.creator.name },
  }, 'You already reported this MeetNow')
})

// POST /api/meetups/:id/messages/:messageId/report { reason, note }
router.post('/:id/messages/:messageId/report', requireVerifiedEmail, reportLimiter, async (req, res) => {
  const input = reportInput(req, res)
  if (!input) return
  const meetup = await memberOf(req, res)
  if (!meetup) return
  const msg = await MeetupMessage.findOne({ _id: req.params.messageId, meetup: meetup._id, kind: 'text' }).populate('sender', 'name').lean()
  if (!msg || !msg.sender) return res.status(404).json({ message: 'Message not found' })
  if (str(msg.sender._id) === str(req.user._id)) return res.status(400).json({ message: 'You cannot report your own message' })
  await fileReport(res, {
    targetType: 'meetup_message', meetup: meetup._id, messageId: msg._id, reportedBy: req.user._id, ...input,
    snapshot: { title: meetup.title, text: msg.text, sender: msg.sender._id, senderName: msg.sender.name },
  }, 'You already reported this message')
})

module.exports = router
