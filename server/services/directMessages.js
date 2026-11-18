// Direct messages: private one-to-one conversations (routes/conversations.js).
// Separate from MeetNow: no meetup ids, no expiry. Messages stay until a member unsends them,
// both members delete the chat, or an account is deleted.
//
// Requests (Instagram model): a conversation is `active` when the receiver follows the starter;
// otherwise it is a `request` in the receiver's Requests tab and the starter can send one text
// message until the receiver accepts (or replies). Declining hides it for the receiver only.

const fs = require('fs')
const mongoose = require('mongoose')
const Conversation  = require('../models/Conversation')
const DirectMessage = require('../models/DirectMessage')
const User = require('../models/User')
const realtime = require('../realtime/socket')
const { hasFeature } = require('../config/features')
const { getBlockSets, isBlockedEitherWay, str } = require('../utils/blocks')
const { uploadMode, localUploadFile } = require('../config/uploadMode')

const MAX_TEXT = 2000
const NEW_CONVERSATIONS_PER_DAY = 30
const REQUESTS_PER_DAY = 10
const PEOPLE = 'name username avatar college year branch showActivityStatus'

const httpError = (status, code, message) => Object.assign(new Error(message), { statusCode: status, code })
const memberOf = (conv, userId) => conv.members.find(m => str(m.user?._id ?? m.user) === str(userId))
const otherOf = (conv, userId) => conv.members.find(m => str(m.user?._id ?? m.user) !== str(userId))

// ── images ────────────────────────────────────────
// Only photos uploaded through POST /conversations/upload-image (Cloudinary folder meetnet_dm, or
// /uploads/dm/ locally) can be attached
function isDmImageUrl(url) {
  if (typeof url !== 'string' || url.length > 500) return false
  if (uploadMode() === 'local') return /\/uploads\/dm\//.test(url) && Boolean(localUploadFile(url))
  const { cloudinaryAsset } = require('./accountDeletion')
  const asset = cloudinaryAsset(url)
  return Boolean(asset && asset.resourceType === 'image' && asset.publicId.startsWith('meetnet_dm/'))
}

async function deleteImages(urls) {
  const list = urls.filter(Boolean)
  if (!list.length) return
  if (uploadMode() === 'local') {
    await Promise.allSettled(list.map(localUploadFile).filter(Boolean).map(f => fs.promises.unlink(f)))
    return
  }
  const { cloudinaryAsset } = require('./accountDeletion')
  const { cloudinary } = require('../config/cloudinary')
  await Promise.allSettled(list.map(cloudinaryAsset).filter(a => a?.publicId.startsWith('meetnet_dm/'))
    .map(a => cloudinary.uploader.destroy(a.publicId, { resource_type: 'image', invalidate: true })))
}

// ── presence ──────────────────────────────────────
// Shown only in accepted conversations, and only when both people have "Show activity status" on
// (a request must not tell its sender whether the other person is around)
function activityFor(viewer, other, otherLastActiveAt, conv) {
  if (conv && conv.status !== 'active') return null
  if (viewer.showActivityStatus === false || other.showActivityStatus === false) return null
  return { online: realtime.isOnline(other._id), lastActiveAt: otherLastActiveAt ?? null }
}

// ── serializers ───────────────────────────────────
function person(u) {
  return u && { _id: u._id, name: u.name, username: u.username, avatar: u.avatar || '', college: u.college, year: u.year, branch: u.branch }
}

function serializeConversation(conv, me, other, { activity, blocked } = {}) {
  const mine = memberOf(conv, me._id)
  const theirs = otherOf(conv, me._id)
  const requester = conv.requestedBy && str(conv.requestedBy)
  return {
    _id: conv._id,
    status: conv.status === 'declined' ? 'request' : conv.status,   // the starter never learns it was declined
    isRequest: conv.status !== 'active',
    requestedByMe: Boolean(requester && requester === str(me._id)),
    other: person(other),
    lastMessage: conv.lastMessage?.at && (!mine.clearedAt || conv.lastMessage.at > mine.clearedAt) ? {
      text: conv.lastMessage.text, image: conv.lastMessage.image, at: conv.lastMessage.at,
      mine: str(conv.lastMessage.sender) === str(me._id),
    } : null,
    lastMessageAt: conv.lastMessageAt,
    unread: mine.unread,
    // "Seen": only for accepted conversations
    otherLastReadAt: conv.status === 'active' ? theirs.lastReadAt : null,
    activity: activity ?? null,
    blocked: Boolean(blocked),
    createdAt: conv.createdAt,
  }
}

function serializeMessage(m, me) {
  return {
    _id: m._id, conversation: m.conversation, sender: m.sender?._id ?? m.sender,
    mine: str(m.sender?._id ?? m.sender) === str(me._id),
    text: m.text || '', image: m.image?.url ? { url: m.image.url, width: m.image.width ?? null, height: m.image.height ?? null } : null,
    replyTo: m.replyTo?.message ? m.replyTo : null,
    deliveredAt: m.deliveredAt, createdAt: m.createdAt,
  }
}

// ── who may write to whom ─────────────────────────
// The other person must exist, have direct messages (staff mode), and neither may have blocked the other
async function checkReachable(me, otherId) {
  if (str(otherId) === str(me._id)) throw httpError(400, 'SELF', 'You cannot message yourself')
  const other = await User.findById(otherId).select(`${PEOPLE} following blockedUsers email`).lean()
  if (!other || !(await hasFeature(other, 'dm'))) throw httpError(404, 'USER_NOT_FOUND', 'User not found')
  const sets = await getBlockSets(me)
  if (isBlockedEitherWay(sets, other._id)) throw httpError(403, 'BLOCKED', "You can't message this account")
  return other
}

// Existing conversation of the pair, or a new one (status from the follow relation)
async function openConversation(me, otherId) {
  const other = await checkReachable(me, otherId)
  const pairKey = Conversation.pairKeyOf(me._id, other._id)
  const existing = await Conversation.findOne({ pairKey })
  if (existing) {
    // They declined this request earlier and now write themselves: it becomes a normal chat
    if (existing.status === 'declined' && str(existing.requestedBy) !== str(me._id)) {
      existing.status = 'active'
      await existing.save()
    }
    return { conv: existing, other, created: false }
  }

  const since = new Date(Date.now() - 24 * 3600e3)
  if (await Conversation.countDocuments({ startedBy: me._id, createdAt: { $gt: since } }) >= NEW_CONVERSATIONS_PER_DAY) {
    throw httpError(429, 'CONVERSATION_LIMIT', `You can start up to ${NEW_CONVERSATIONS_PER_DAY} new chats a day.`)
  }
  const followsMe = (other.following || []).some(id => str(id) === str(me._id))
  if (!followsMe && await Conversation.countDocuments({ requestedBy: me._id, createdAt: { $gt: since } }) >= REQUESTS_PER_DAY) {
    throw httpError(429, 'REQUEST_LIMIT', `You can send up to ${REQUESTS_PER_DAY} message requests a day.`)
  }
  try {
    const conv = await Conversation.create({
      pairKey, startedBy: me._id, status: followsMe ? 'active' : 'request', requestedBy: followsMe ? null : me._id,
      members: [{ user: me._id }, { user: other._id }],
    })
    return { conv, other, created: true }
  } catch (err) {
    if (err.code === 11000) return { conv: await Conversation.findOne({ pairKey }), other, created: false }
    throw err
  }
}

// A conversation this user is in (null if not)
async function loadFor(me, conversationId) {
  if (!mongoose.isValidObjectId(conversationId)) return null
  const conv = await Conversation.findOne({ _id: conversationId, 'members.user': me._id })
  if (!conv) return null
  // A declined request is gone for the person who declined it
  if (conv.status === 'declined' && str(conv.requestedBy) !== str(me._id)) return null
  return conv
}

async function send(me, conv, { text, imageUrl, imageSize, replyTo }) {
  const other = await checkReachable(me, otherOf(conv, me._id).user)
  const body = typeof text === 'string' ? text.trim() : ''
  if (body.length > MAX_TEXT) throw httpError(400, 'TOO_LONG', `Message is too long (max ${MAX_TEXT} characters)`)
  if (imageUrl !== undefined && imageUrl !== null && !isDmImageUrl(imageUrl)) throw httpError(400, 'INVALID_IMAGE', 'Upload the photo first')
  if (!body && !imageUrl) throw httpError(400, 'EMPTY', 'Message is empty')

  const isStarter = conv.requestedBy && str(conv.requestedBy) === str(me._id)
  if (conv.status !== 'active') {
    if (isStarter) {
      // one text message until it is accepted
      if (await DirectMessage.exists({ conversation: conv._id, sender: me._id })) {
        throw httpError(403, 'REQUEST_PENDING', 'You can send more messages once they accept your request.')
      }
      if (imageUrl) throw httpError(400, 'REQUEST_TEXT_ONLY', 'A message request can only be text.')
      const { hasProfanity } = require('../utils/moderation')
      if (hasProfanity(body)) throw httpError(400, 'PROFANITY', 'Please keep it respectful.')
    } else {
      conv.status = 'active'   // replying accepts the request
    }
  }

  let reply = null
  if (replyTo && mongoose.isValidObjectId(replyTo)) {
    const orig = await DirectMessage.findOne({ _id: replyTo, conversation: conv._id }).lean()
    if (orig) {
      const author = str(orig.sender) === str(me._id) ? me : other
      reply = { message: orig._id, text: (orig.text || '').slice(0, 120), image: Boolean(orig.image?.url), senderName: author.name }
    }
  }
  const msg = await DirectMessage.create({
    conversation: conv._id, sender: me._id, text: body,
    ...(imageUrl && { image: { url: imageUrl, width: imageSize?.width, height: imageSize?.height } }),
    ...(reply && { replyTo: reply }),
  })

  const now = msg.createdAt
  conv.lastMessage = { text: body.slice(0, 120), image: Boolean(imageUrl), sender: me._id, at: now }
  conv.lastMessageAt = now
  const mine = memberOf(conv, me._id)
  mine.lastReadAt = now
  mine.unread = 0
  otherOf(conv, me._id).unread += 1
  await conv.save()

  const out = serializeMessage(msg.toObject(), me)
  realtime.emitToUser(other._id, 'dm:new', { conversationId: str(conv._id), message: { ...out, mine: false } })
  realtime.emitToUser(me._id, 'dm:new', { conversationId: str(conv._id), message: out })
  return out
}

async function markRead(me, conv) {
  const now = new Date()
  const mine = memberOf(conv, me._id)
  mine.lastReadAt = now
  mine.unread = 0
  await conv.save()
  const other = otherOf(conv, me._id).user
  await markDelivered(me, conv)
  if (conv.status === 'active') realtime.emitToUser(other, 'dm:read', { conversationId: str(conv._id), at: now })
}

// Messages from the other person have reached this user (a fetch, or the socket's ack). Not for
// requests: opening a request must not tell its sender anything until it is accepted.
async function markDelivered(me, conv) {
  if (conv.status !== 'active') return
  const other = otherOf(conv, me._id).user
  const now = new Date()
  const { modifiedCount } = await DirectMessage.updateMany(
    { conversation: conv._id, sender: other, deliveredAt: null }, { $set: { deliveredAt: now } })
  if (modifiedCount) realtime.emitToUser(other, 'dm:delivered', { conversationId: str(conv._id), at: now })
}

// Unsend: the message and its photo are deleted for both
async function unsend(me, conv, messageId) {
  const msg = await DirectMessage.findOne({ _id: messageId, conversation: conv._id })
  if (!msg) throw httpError(404, 'MESSAGE_NOT_FOUND', 'Message not found')
  if (str(msg.sender) !== str(me._id)) throw httpError(403, 'NOT_YOURS', 'You can only unsend your own messages')
  await DirectMessage.deleteOne({ _id: msg._id })
  await deleteImages([msg.image?.url])
  const theirs = otherOf(conv, me._id)
  if (theirs.unread > 0 && (!theirs.lastReadAt || theirs.lastReadAt < msg.createdAt)) theirs.unread -= 1
  await refreshLast(conv)
  await conv.save()
  for (const u of [me._id, theirs.user]) realtime.emitToUser(u, 'dm:unsent', { conversationId: str(conv._id), messageId: str(msg._id) })
}

async function refreshLast(conv) {
  const last = await DirectMessage.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).lean()
  conv.lastMessage = last ? { text: (last.text || '').slice(0, 120), image: Boolean(last.image?.url), sender: last.sender, at: last.createdAt } : undefined
  conv.lastMessageAt = last ? last.createdAt : null
}

// "Delete chat" for me. When both members have deleted it, what both deleted is deleted for good.
async function clearFor(me, conv) {
  const mine = memberOf(conv, me._id)
  mine.clearedAt = new Date()
  mine.unread = 0
  const theirs = otherOf(conv, me._id)
  if (theirs.clearedAt) {
    const upTo = new Date(Math.min(mine.clearedAt, theirs.clearedAt))
    const gone = await DirectMessage.find({ conversation: conv._id, createdAt: { $lte: upTo } }).select('image').lean()
    await DirectMessage.deleteMany({ conversation: conv._id, createdAt: { $lte: upTo } })
    await deleteImages(gone.map(m => m.image?.url))
    if (!(await DirectMessage.exists({ conversation: conv._id }))) {
      await Conversation.deleteOne({ _id: conv._id })
      return
    }
    await refreshLast(conv)
  }
  await conv.save()
}

// Account deletion: every conversation they were in goes, with all messages and photos
async function removeUser(userId) {
  const convs = await Conversation.find({ 'members.user': userId }).select('members').lean()
  for (const c of convs) {
    const msgs = await DirectMessage.find({ conversation: c._id }).select('image').lean()
    await DirectMessage.deleteMany({ conversation: c._id })
    await deleteImages(msgs.map(m => m.image?.url))
    await Conversation.deleteOne({ _id: c._id })
    const other = c.members.find(m => str(m.user) !== str(userId))
    if (other) realtime.emitToUser(other.user, 'dm:removed', { conversationId: str(c._id) })
  }
  await DirectMessage.deleteMany({ sender: userId })   // anything left over
}

module.exports = {
  MAX_TEXT, NEW_CONVERSATIONS_PER_DAY, REQUESTS_PER_DAY, PEOPLE,
  httpError, memberOf, otherOf, isDmImageUrl, deleteImages, activityFor, person,
  serializeConversation, serializeMessage, checkReachable, openConversation, loadFor,
  send, markRead, markDelivered, unsend, clearFor, removeUser,
}
