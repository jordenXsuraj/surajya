// Real-time delivery over Socket.IO (MeetNow group chats now, direct messages later).
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

const { Server } = require('socket.io')
const mongoose = require('mongoose')
const { authenticate } = require('../middleware/auth')
const { hasFeature, featuresFor } = require('../config/features')
const { getBlockSets, str } = require('../utils/blocks')

let io = null

const OBJECT_ID = /^[0-9a-f]{24}$/i
const collegeRoom = college => `meetnow:college:${String(college).trim().toLowerCase()}`
const feedRoom = meetup => (meetup.visibility === 'everyone' ? 'meetnow:everyone' : collegeRoom(meetup.college))

// Per-socket budget for subscribe calls (each one reads the database): 30 per minute
function allow(socket) {
  const now = Date.now()
  const b = socket.data.bucket ?? (socket.data.bucket = { tokens: 30, at: now })
  b.tokens = Math.min(30, b.tokens + ((now - b.at) / 60_000) * 30)
  b.at = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
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
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', socket => {
    const me = socket.data.user
    socket.join(`user:${me._id}`)

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
  for (const s of sockets) {
    const hidden = message.kind === 'text' && sender && s.data.blocked?.has(sender)
    s.emit('meetup:message', hidden ? { ...message, text: null, hidden: true } : message)
  }
}

// Member count changed: to the chat and to everyone who sees the card
function meetupMembers(meetup, change) {
  if (!io) return
  const payload = { meetupId: str(meetup._id), memberCount: meetup.memberCount, ...change }
  io.to(`meetup:${str(meetup._id)}`).to(feedRoom(meetup)).emit('meetup:members', payload)
}

// A meetup was created: cards appear for the people who may see it
function meetupCreated(meetup) {
  if (!io) return
  io.to(feedRoom(meetup)).emit('meetup:created', { meetupId: str(meetup._id) })
}

// The meetup is gone (expired, ended, emptied): tell everyone, then close the room
function meetupEnded(meetup, reason) {
  if (!io) return
  const id = str(meetup._id)
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
  io.to(`user:${str(userId)}`).emit(event, payload)
}

module.exports = { attach, meetupMessage, meetupMembers, meetupCreated, meetupEnded, disconnectUser, emitToUser, getIO: () => io }
