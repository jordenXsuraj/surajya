// Direct messages (web first; server/API_MOBILE.md, "Direct messages"). Behind the `dm` feature switch
// (config/features.js): while it is off for this account every route here is the ordinary 404.
// Logic in services/directMessages.js; MeetNow is a separate system.

const express = require('express')
const mongoose = require('mongoose')
const { rateLimit } = require('express-rate-limit')
const protect = require('../middleware/auth')
const requireVerifiedEmail = require('../middleware/requireVerifiedEmail')
const validObjectIdParam = require('../middleware/validObjectId')
const { requireFeature } = require('../config/features')
const { dmImageUpload } = require('../config/cloudinary')
const Conversation = require('../models/Conversation')
const DirectMessage = require('../models/DirectMessage')
const Report = require('../models/Report')
const User = require('../models/User')
const { getBlockSets, isBlockedEitherWay, str } = require('../utils/blocks')
const dm = require('../services/directMessages')

const router = express.Router()
router.use(requireFeature('dm'))
router.use(protect)
for (const name of ['id', 'messageId']) router.param(name, validObjectIdParam)

const REPORT_REASONS = ['spam', 'hate', 'harassment', 'misinformation', 'other']
const REPORT_DAYS = 90

const perUser = (windowMs, limit, message) => rateLimit({
  windowMs, limit,
  keyGenerator: req => `user:${req.user._id}`,
  message: { code: 'RATE_LIMITED', message },
  standardHeaders: 'draft-7', legacyHeaders: false,
})
const messageLimiter = perUser(60e3, 30, 'You are sending messages too fast. Wait a moment.')
const uploadLimiter  = perUser(3600e3, 30, 'Too many photos. Try again later.')
const reportLimiter  = perUser(3600e3, 20, 'Too many reports. Try again later.')

const notFound = res => res.status(404).json({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' })
const noStore = res => res.set('Cache-Control', 'private, no-store')

async function others(convs, me) {
  const ids = convs.map(c => dm.otherOf(c, me._id).user)
  const users = await User.find({ _id: { $in: ids } }).select(`${dm.PEOPLE} +lastActiveAt`).lean()
  return new Map(users.map(u => [str(u._id), u]))
}

// ── GET /api/conversations?tab=chats|requests&search= ──
// chats: accepted conversations and the requests I sent; requests: requests sent to me
router.get('/', async (req, res) => {
  const me = req.user
  const tab = req.query.tab === 'requests' ? 'requests' : 'chats'
  const filter = { 'members.user': me._id, lastMessageAt: { $ne: null } }
  if (tab === 'requests') Object.assign(filter, { status: 'request', requestedBy: { $ne: me._id } })
  else filter.$or = [{ status: 'active' }, { requestedBy: me._id }]
  const convs = await Conversation.find(filter).sort({ lastMessageAt: -1 }).limit(200)
  const people = await others(convs, me)
  const sets = await getBlockSets(me)
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase().slice(0, 50) : ''
  const list = []
  for (const c of convs) {
    const other = people.get(str(dm.otherOf(c, me._id).user))
    if (!other || isBlockedEitherWay(sets, other._id)) continue
    const mine = dm.memberOf(c, me._id)
    if (mine.clearedAt && c.lastMessageAt <= mine.clearedAt) continue   // deleted for me, nothing new since
    if (search && !`${other.name} ${other.username || ''}`.toLowerCase().includes(search)) continue
    list.push(dm.serializeConversation(c, me, other, { activity: dm.activityFor(me, other, other.lastActiveAt, c) }))
  }
  noStore(res)
  res.json(list)
})

// ── GET /api/conversations/unread-count → { chats, requests } ──
router.get('/unread-count', async (req, res) => {
  const me = req.user
  const convs = await Conversation.find({ 'members.user': me._id, lastMessageAt: { $ne: null } }).select('members status requestedBy').lean()
  const sets = await getBlockSets(me)
  let chats = 0, requests = 0
  for (const c of convs) {
    const other = dm.otherOf(c, me._id)
    if (isBlockedEitherWay(sets, other.user)) continue
    const mine = dm.memberOf(c, me._id)
    if (c.status === 'active' && mine.unread > 0) chats++
    else if (c.status === 'request' && str(c.requestedBy) !== str(me._id) && mine.unread > 0) requests++
  }
  noStore(res)
  res.json({ chats, requests })
})

// ── POST /api/conversations { userId } — open (or create) the chat with someone ──
router.post('/', requireVerifiedEmail, async (req, res) => {
  const userId = req.body?.userId
  if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid ID format' })
  const { conv, other, created } = await dm.openConversation(req.user, userId)
  const full = await User.findById(other._id).select('+lastActiveAt showActivityStatus').lean()
  noStore(res)
  res.status(created ? 201 : 200).json(dm.serializeConversation(conv, req.user, other, { activity: dm.activityFor(req.user, other, full?.lastActiveAt, conv) }))
})

// ── POST /api/conversations/upload-image (multipart "image") → { url, width, height } ──
router.post('/upload-image', requireVerifiedEmail, uploadLimiter, dmImageUpload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No image received' })
  res.json({ url: req.file.path, width: req.file.width ?? null, height: req.file.height ?? null })
})

async function load(req, res) {
  const conv = await dm.loadFor(req.user, req.params.id)
  if (!conv) { notFound(res); return null }
  return conv
}

// ── GET /api/conversations/:id ──
router.get('/:id', async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  const other = await User.findById(dm.otherOf(conv, req.user._id).user).select(`${dm.PEOPLE} +lastActiveAt`).lean()
  if (!other) return notFound(res)
  const blocked = isBlockedEitherWay(await getBlockSets(req.user), other._id)
  noStore(res)
  res.json(dm.serializeConversation(conv, req.user, other, { activity: blocked ? null : dm.activityFor(req.user, other, other.lastActiveAt, conv), blocked }))
})

// ── GET /api/conversations/:id/messages?before=<ISO>&limit= — oldest first ──
router.get('/:id/messages', async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  const me = req.user
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100)
  const filter = { conversation: conv._id, hiddenFor: { $ne: me._id } }
  const mine = dm.memberOf(conv, me._id)
  const before = req.query.before ? new Date(String(req.query.before)) : null
  filter.createdAt = {
    ...(mine.clearedAt && { $gt: mine.clearedAt }),
    ...(before && !Number.isNaN(before.getTime()) && { $lt: before }),
  }
  if (!Object.keys(filter.createdAt).length) delete filter.createdAt
  const rows = await DirectMessage.find(filter).sort({ createdAt: -1 }).limit(limit).lean()
  await dm.markDelivered(me, conv)
  noStore(res)
  res.json(rows.reverse().map(m => dm.serializeMessage(m, me)))
})

// ── POST /api/conversations/:id/messages { text?, imageUrl?, imageWidth?, imageHeight?, replyTo? } ──
router.post('/:id/messages', requireVerifiedEmail, messageLimiter, async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  const b = req.body || {}
  const size = { width: Number.isFinite(b.imageWidth) ? b.imageWidth : undefined, height: Number.isFinite(b.imageHeight) ? b.imageHeight : undefined }
  const out = await dm.send(req.user, conv, { text: b.text, imageUrl: b.imageUrl, imageSize: size, replyTo: b.replyTo })
  res.status(201).json(out)
})

// ── POST /api/conversations/:id/read ──
router.post('/:id/read', async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  await dm.markRead(req.user, conv)
  res.json({ ok: true })
})

// ── Requests: accept / decline (the receiver only) ──
async function requestFor(req, res) {
  const conv = await load(req, res)
  if (!conv) return null
  if (conv.status !== 'request' || str(conv.requestedBy) === str(req.user._id)) {
    res.status(400).json({ code: 'NOT_A_REQUEST', message: 'This is not a request to you' })
    return null
  }
  return conv
}
router.post('/:id/accept', async (req, res) => {
  const conv = await requestFor(req, res)
  if (!conv) return
  conv.status = 'active'
  await conv.save()
  require('../realtime/socket').emitToUser(conv.requestedBy, 'dm:accepted', { conversationId: str(conv._id) })
  res.json({ status: 'active' })
})
router.post('/:id/decline', async (req, res) => {
  const conv = await requestFor(req, res)
  if (!conv) return
  conv.status = 'declined'
  const mine = dm.memberOf(conv, req.user._id)
  mine.clearedAt = new Date()
  mine.unread = 0
  await conv.save()
  res.json({ status: 'declined' })
})

// ── DELETE /api/conversations/:id — delete the chat for me ──
router.delete('/:id', async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  await dm.clearFor(req.user, conv)
  res.json({ deleted: true })
})

// ── DELETE /api/conversations/:id/messages/:messageId?for=me|everyone ──
router.delete('/:id/messages/:messageId', async (req, res) => {
  const conv = await load(req, res)
  if (!conv) return
  if (req.query.for === 'everyone') {
    await dm.unsend(req.user, conv, req.params.messageId)
    return res.json({ unsent: true })
  }
  const { matchedCount } = await DirectMessage.updateOne(
    { _id: req.params.messageId, conversation: conv._id }, { $addToSet: { hiddenFor: req.user._id } })
  if (!matchedCount) return res.status(404).json({ code: 'MESSAGE_NOT_FOUND', message: 'Message not found' })
  res.json({ hidden: true })
})

// ── POST /api/conversations/:id/messages/:messageId/report { reason, note? } ──
// The report keeps a copy (text, photo link, sender) for 90 days so the team can review it
router.post('/:id/messages/:messageId/report', requireVerifiedEmail, reportLimiter, async (req, res) => {
  const { reason, note } = req.body || {}
  if (!REPORT_REASONS.includes(reason)) return res.status(400).json({ message: 'Invalid reason' })
  const conv = await load(req, res)
  if (!conv) return
  const msg = await DirectMessage.findOne({ _id: req.params.messageId, conversation: conv._id }).populate('sender', 'name').lean()
  if (!msg || !msg.sender) return res.status(404).json({ code: 'MESSAGE_NOT_FOUND', message: 'Message not found' })
  if (str(msg.sender._id) === str(req.user._id)) return res.status(400).json({ message: 'You cannot report your own message' })
  try {
    await Report.create({
      targetType: 'direct_message', messageId: msg._id, reportedBy: req.user._id, reason,
      note: typeof note === 'string' ? note.trim().slice(0, 300) : '',
      snapshot: { text: (msg.text || '').slice(0, 1000) || (msg.image?.url ? '[photo]' : ''), imageUrl: msg.image?.url, sender: msg.sender._id, senderName: msg.sender.name },
      expiresAt: new Date(Date.now() + REPORT_DAYS * 864e5),
    })
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'You already reported this message' })
    throw err
  }
  res.json({ message: 'Report submitted. Thank you.' })
})

module.exports = router
