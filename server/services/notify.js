// In-app notifications + Expo push. Every notification goes through here.
// Fire-and-forget: never throws, so callers don't need to await it and an
// HTTP request can't fail because a notification or push failed.

const { Expo } = require('expo-server-sdk')
const Notification = require('../models/Notification')
const User = require('../models/User')
const Post = require('../models/Post')

// new_post is in-app only (see notifyFollowers)
const PUSH_TYPES = new Set(['connection_request', 'connection_accepted', 'post_replied', 'post_liked', 'interested'])
const RECEIPT_DELAY_MS = 15 * 60 * 1000   // Expo recommends checking receipts ~15 min later

let expo = new Expo(process.env.EXPO_ACCESS_TOKEN ? { accessToken: process.env.EXPO_ACCESS_TOKEN } : {})

const str = id => (id?._id ?? id)?.toString()
const blockedBetween = (a, b) =>
  (a.blockedUsers || []).some(id => str(id) === str(b._id)) ||
  (b.blockedUsers || []).some(id => str(id) === str(a._id))

function removeTokens(tokens) {
  if (!tokens.length) return Promise.resolve()
  return User.updateMany(
    { 'pushTokens.token': { $in: tokens } },
    { $pull: { pushTokens: { token: { $in: tokens } } } }
  ).catch(err => console.error('push: failed to remove tokens:', err.message))
}

async function checkReceipts(ticketToToken) {
  const dead = []
  const ids = Object.keys(ticketToToken)
  for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk)
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status === 'error') {
          if (receipt.details?.error === 'DeviceNotRegistered') dead.push(ticketToToken[id])
          else console.error(`push receipt error: ${receipt.details?.error || receipt.message}`)
        }
      }
    } catch (err) { console.error('push: receipt check failed:', err.message) }
  }
  await removeTokens(dead)
  return dead
}

async function sendPush(recipient, { type, postId, senderId, message }) {
  const tokens = (recipient.pushTokens || []).map(t => t.token).filter(t => Expo.isExpoPushToken(t))
  if (!tokens.length) return
  const data = { type, postId: postId || null, senderId, url: postId ? `/post/${postId}` : `/profile/${senderId}` }
  const messages = tokens.map(to => ({ to, sound: 'default', title: 'MeetNet', body: message, data }))

  const dead = []
  const pending = {}
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk)
      tickets.forEach((ticket, i) => {
        if (ticket.status === 'ok' && ticket.id) pending[ticket.id] = chunk[i].to
        else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(chunk[i].to)
        else if (ticket.status === 'error') console.error(`push ticket error: ${ticket.details?.error || ticket.message}`)
      })
    } catch (err) { console.error('push: send failed:', err.message) }
  }
  await removeTokens(dead)
  if (Object.keys(pending).length) {
    setTimeout(() => { checkReceipts(pending) }, RECEIPT_DELAY_MS).unref()
  }
}

// Returns the created Notification, or null when skipped/failed.
async function notify({ recipient, sender, type, post, message }) {
  try {
    if (!recipient || !sender || str(recipient) === str(sender)) return null

    const postId = post ? str(post) : null
    const [to, from, postDoc] = await Promise.all([
      User.findById(recipient).select('blockedUsers +pushTokens').lean(),
      User.findById(sender).select('blockedUsers').lean(),
      postId ? Post.findById(postId).select('isAnonymous postedBy').lean() : null,
    ])
    if (!to || !from) return null
    if (blockedBetween(to, from)) return null

    // The anonymous author must never appear as the sender of anything about their post
    if (postDoc?.isAnonymous && str(postDoc.postedBy) === str(sender)) return null

    const doc = await Notification.create({ recipient, sender, type, post: postId, message })

    if (PUSH_TYPES.has(type)) await sendPush(to, { type, postId, senderId: str(sender), message })
    return doc
  } catch (err) {
    console.error(`notify(${type}) failed:`, err.message)
    return null
  }
}

// new_post fan-out: in-app only (no push), skipping anyone blocked either way.
async function notifyFollowers({ sender, followerIds, post, message }) {
  try {
    if (!followerIds?.length) return 0
    const me = await User.findById(sender).select('blockedUsers').lean()
    const iBlocked = new Set((me?.blockedUsers || []).map(str))
    const recipients = await User.find({
      _id: { $in: followerIds.filter(id => !iBlocked.has(str(id)) && str(id) !== str(sender)) },
      blockedUsers: { $ne: sender },
    }).select('_id').lean()
    if (!recipients.length) return 0
    await Notification.insertMany(recipients.map(r => ({
      recipient: r._id, sender, type: 'new_post', post: str(post), message,
    })))
    return recipients.length
  } catch (err) {
    console.error('notifyFollowers failed:', err.message)
    return 0
  }
}

module.exports = {
  notify, notifyFollowers, checkReceipts, PUSH_TYPES,
  _setExpoClient: client => { expo = client },   // tests
}
