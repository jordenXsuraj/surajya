// Real-time delivery over Socket.IO (MeetNow group chats, direct messages).
//
// - Sending stays on the REST routes (auth, validation, rate limits, errors in one place); the socket
//   only pushes events to clients and lets them subscribe to rooms.
// - The handshake uses the same JWT check as the API (token version included). An account with no
//   staged feature available (config/features.js) is refused, and every subscription re-checks the
//   feature, membership and expiry on the server.
// - Rooms: user:<id> (every socket of an account), meetup:<id> (subscribed members of one MeetNow),
//   meetnow:college:<college> and meetnow:everyone (live counts on the MeetNow cards).
// - One server instance keeps rooms in memory; several instances would need a Socket.IO adapter.
// Every helper is a no-op until attach() ran (tests that only use the HTTP app).

const os = require('os')
const crypto = require('crypto')
const { Server } = require('socket.io')
const mongoose = require('mongoose')
const { authenticate } = require('../middleware/auth')
const { hasFeature, featuresFor } = require('../config/features')
const { getBlockSets, str } = require('../utils/blocks')

let io = null

// Diagnostics (server logs only, never in API responses): which instance a connection or event is on.
// Rooms live in memory per instance, so during a deploy overlap two instances can each hold half of
// the connections. REALTIME_LOG=off silences it. User ids are logged as a short hash.
const INSTANCE = process.env.RENDER_INSTANCE_ID || os.hostname()
const shortId = id => crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 8)
const roomLabel = room => (room.startsWith('user:') ? `user:${shortId(room.slice(5))}` : room.replace(/^meetnow:college:.*/, 'meetnow:college:*'))
function rtLog(text) {
  if (process.env.REALTIME_LOG === 'off' || process.env.NODE_ENV === 'test') return
  console.log(`[rt] ${INSTANCE} ${text}`)
}
// How many sockets in this room are connected to THIS instance
const localCount = room => io?.sockets.adapter.rooms.get(room)?.size ?? 0
function logEmit(event, rooms) {
  rtLog(`emit ${event} → ${rooms.map(r => `${roomLabel(r)}(${localCount(r)} here)`).join(', ')}`)
}
// Direct messages: how many live connections each account has (one server instance)
const online = new Map()
const isOnline = userId => (online.get(str(userId)) || 0) > 0

const OBJECT_ID = /^[0-9a-f]{24}$/i
const collegeRoom = college => `meetnow:college:${String(college).trim().toLowerCase()}`
const feedRoom = meetup => (meetup.visibility === 'everyone' ? 'meetnow:everyone' : collegeRoom(meetup.college))

// Per-socket budgets for events that read the database (per minute): subscribe 30, typing etc. 60
function allow(socket, name = 'bucket', perMinute = 30) {
  const now = Date.now()
  const b = socket.data[name] ?? (socket.data[name] = { tokens: perMinute, at: now })
  b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}

// Tell the people this account chats with that it came online / went offline — only those who,
// like this account, have "Show activity status" on
async function announcePresence(userId, isNowOnline) {
  const User = mongoose.model('User')
  const Conversation = mongoose.model('Conversation')
  const at = new Date()
  const me = await User.findByIdAndUpdate(userId, { $set: { lastActiveAt: at } }, { projection: { showActivityStatus: 1 } }).lean()
  if (!me || me.showActivityStatus === false) return
  const convs = await Conversation.find({ 'members.user': userId, status: 'active' }).select('members').limit(500).lean()
  const partnerIds = convs.map(c => c.members.find(m => str(m.user) !== str(userId))?.user).filter(Boolean)
  const partners = await User.find({ _id: { $in: partnerIds }, showActivityStatus: { $ne: false } }).select('_id').lean()
  for (const p of partners) {
    logEmit('dm:presence', [`user:${str(p._id)}`])
    io?.to(`user:${str(p._id)}`).emit('dm:presence', { userId: str(userId), online: isNowOnline, lastActiveAt: at })
  }
}

function attach(httpServer, { corsOrigin } = {}) {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin ?? false, credentials: true },
    maxHttpBufferSize: 16 * 1024,   // clients only send small control messages
    pingInterval: 25_000,
    pingTimeout: 20_000,
  })

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (typeof token !== 'string' || !token) return next(new Error('unauthorized'))
      const { user, error } = await authenticate({ headers: { authorization: `Bearer ${token}` } })
      if (error || !user) return next(new Error('unauthorized'))
      const features = await featuresFor(user)
      if (!Object.values(features).some(Boolean)) return next(new Error('not_available'))
      socket.data.user = { _id: str(user._id), email: user.email, college: user.college, blockedUsers: user.blockedUsers || [] }
      socket.data.features = features
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', socket => {
    const me = socket.data.user
    socket.join(`user:${me._id}`)
    rtLog(`connect user:${shortId(me._id)} via ${socket.conn.transport.name} (${io.engine.clientsCount} connected here)`)
    socket.on('disconnect', reason => rtLog(`disconnect user:${shortId(me._id)} ${reason} (${io.engine.clientsCount} connected here)`))

    // ── Direct messages: presence, typing, delivery ──
    if (socket.data.features.dm) {
      const count = (online.get(me._id) || 0) + 1
      online.set(me._id, count)
      if (count === 1) announcePresence(me._id, true).catch(() => {})
      socket.on('disconnect', () => {
        const left = (online.get(me._id) || 1) - 1
        if (left > 0) return online.set(me._id, left)
        online.delete(me._id)
        announcePresence(me._id, false).catch(() => {})
      })
    }

    // "typing…" to the other member of an accepted conversation (the client sends it at most every few seconds)
    socket.on('dm:typing', async payload => {
      const id = payload?.conversationId
      if (!allow(socket, 'typing', 60) || typeof id !== 'string' || !OBJECT_ID.test(id)) return
      if (!(await hasFeature(me, 'dm'))) return
      const Conversation = mongoose.model('Conversation')
      const conv = await Conversation.findOne({ _id: id, 'members.user': me._id, status: 'active' }).select('members').lean()
      if (!conv) return
      const other = conv.members.find(m => str(m.user) !== me._id)?.user
      const sets = await getBlockSets({ _id: new mongoose.Types.ObjectId(me._id), blockedUsers: me.blockedUsers })
      if (!other || sets.all.has(str(other))) return
      logEmit('dm:typing', [`user:${str(other)}`])
      io.to(`user:${str(other)}`).emit('dm:typing', { conversationId: id })
    })

    // The client received new messages: mark them delivered (the sender sees "Delivered")
    socket.on('dm:delivered', async payload => {
      const id = payload?.conversationId
      if (!allow(socket, 'typing', 60) || typeof id !== 'string' || !OBJECT_ID.test(id)) return
      if (!(await hasFeature(me, 'dm'))) return
      const dm = require('../services/directMessages')
      const conv = await dm.loadFor({ _id: me._id }, id)
      if (conv) await dm.markDelivered({ _id: me._id }, conv)
    })

    // Live counts and endings for the MeetNow cards the user can see
    socket.on('meetnow:watch', async (_payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      if (!allow(socket) || !(await hasFeature(me, 'meetnow'))) return reply({ ok: false })
      socket.join(['meetnow:everyone', collegeRoom(me.college)])
      reply({ ok: true })
    })
    socket.on('meetnow:unwatch', () => {
      socket.leave('meetnow:everyone')
      socket.leave(collegeRoom(me.college))
    })

    // One MeetNow's chat: members of an active meetup only
    socket.on('meetup:subscribe', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {}
      const id = payload?.meetupId
      if (!allow(socket) || typeof id !== 'string' || !OBJECT_ID.test(id)) return reply({ ok: false })
      if (!(await hasFeature(me, 'meetnow'))) return reply({ ok: false })
      const Meetup = mongoose.model('Meetup')
      const MeetupMember = mongoose.model('MeetupMember')
      const [meetup, member] = await Promise.all([
        Meetup.exists({ _id: id, expiresAt: { $gt: new Date() } }),
        MeetupMember.exists({ meetup: id, user: me._id }),
      ])
      if (!meetup || !member) return reply({ ok: false, code: meetup ? 'NOT_A_MEMBER' : 'MEETUP_NOT_FOUND' })
      // Who this user blocked or is blocked by: their messages arrive hidden
      const sets = await getBlockSets({ _id: new mongoose.Types.ObjectId(me._id), blockedUsers: me.blockedUsers })
      socket.data.blocked = sets.all
      socket.join(`meetup:${id}`)
      reply({ ok: true })
    })
    socket.on('meetup:unsubscribe', payload => {
      if (typeof payload?.meetupId === 'string') socket.leave(`meetup:${payload.meetupId}`)
    })
  })

  return io
}

// A new chat message (or system line) to the subscribed members. Members who blocked the sender (or
// were blocked by them) get it without the text, as the REST history does.
async function meetupMessage(meetupId, message) {
  if (!io) return
  const room = `meetup:${meetupId}`
  const sender = str(message.sender?._id ?? message.sender)
  const sockets = await io.in(room).fetchSockets()
  logEmit('meetup:message', [room])
  for (const s of sockets) {
    const hidden = message.kind === 'text' && sender && s.data.blocked?.has(sender)
    s.emit('meetup:message', hidden ? { ...message, text: null, hidden: true } : message)
  }
}

// Member count changed: to the chat and to everyone who sees the card
function meetupMembers(meetup, change) {
  if (!io) return
  const payload = { meetupId: str(meetup._id), memberCount: meetup.memberCount, ...change }
  logEmit('meetup:members', [`meetup:${str(meetup._id)}`, feedRoom(meetup)])
  io.to(`meetup:${str(meetup._id)}`).to(feedRoom(meetup)).emit('meetup:members', payload)
}

// A meetup was created: cards appear for the people who may see it
function meetupCreated(meetup) {
  if (!io) return
  logEmit('meetup:created', [feedRoom(meetup)])
  io.to(feedRoom(meetup)).emit('meetup:created', { meetupId: str(meetup._id) })
}

// The meetup is gone (expired, ended, emptied): tell everyone, then close the room
function meetupEnded(meetup, reason) {
  if (!io) return
  const id = str(meetup._id)
  logEmit('meetup:ended', [`meetup:${id}`, feedRoom(meetup)])
  io.to(`meetup:${id}`).to(feedRoom(meetup)).emit('meetup:ended', { meetupId: id, reason })
  io.in(`meetup:${id}`).socketsLeave(`meetup:${id}`)
}

// Logged out everywhere / password changed / account deleted: drop the live connections too
function disconnectUser(userId) {
  if (!io) return
  io.in(`user:${str(userId)}`).disconnectSockets(true)
}

function emitToUser(userId, event, payload) {
  if (!io) return
  logEmit(event, [`user:${str(userId)}`])
  io.to(`user:${str(userId)}`).emit(event, payload)
}

module.exports = { attach, meetupMessage, meetupMembers, meetupCreated, meetupEnded, disconnectUser, emitToUser, isOnline, getIO: () => io }
