// MeetNow lifecycle: create, join, leave, end, expire, and account deletion.
// The only way a meetup goes away is endMeetup(): it deletes the meetup, its members and its
// messages (no archive, no soft delete), then tells connected clients. Expiry, the creator's End
// button, the last member leaving, "Until I leave" and account deletion all go through it.
// Direct messages are a separate system and are never touched here.

const Meetup        = require('../models/Meetup')
const MeetupMember  = require('../models/MeetupMember')
const MeetupMessage = require('../models/MeetupMessage')
const realtime      = require('../realtime/socket')
const { str }       = require('../utils/blocks')

const DEFAULT_MINUTES   = 24 * 60
const MIN_MINUTES       = 15
const MAX_MINUTES       = 72 * 60
const UNTIL_LEAVE_HOURS = 24
const MAX_MEMBERS       = 100
const MAX_ACTIVE_PER_CREATOR = 3

const active = (now = new Date()) => ({ expiresAt: { $gt: now } })

// { durationMinutes } (15 min – 72 h), { duration: 'until_leave' } (≤ 24 h) or nothing (24 h)
function resolveExpiry(body, now = new Date()) {
  if (body?.duration === 'until_leave') {
    return { expiresAt: new Date(now.getTime() + UNTIL_LEAVE_HOURS * 3600e3), endsWhenCreatorLeaves: true }
  }
  const raw = body?.durationMinutes
  if (raw === undefined || raw === null || raw === '') {
    return { expiresAt: new Date(now.getTime() + DEFAULT_MINUTES * 60e3), endsWhenCreatorLeaves: false }
  }
  const minutes = Number(raw)
  if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
    return { error: `Duration must be between ${MIN_MINUTES} minutes and ${MAX_MINUTES / 60} hours` }
  }
  return { expiresAt: new Date(now.getTime() + minutes * 60e3), endsWhenCreatorLeaves: false }
}

async function systemLine(meetup, actor, text) {
  const msg = await MeetupMessage.create({ meetup: meetup._id, sender: actor?._id ?? null, kind: 'system', text, expiresAt: meetup.expiresAt })
  await realtime.meetupMessage(str(meetup._id), serializeMessage(msg.toObject(), actor))
}

function serializeMessage(m, sender) {
  const s = sender ?? m.sender
  return {
    _id: m._id, meetup: m.meetup, kind: m.kind, text: m.text, createdAt: m.createdAt,
    sender: s && s._id ? { _id: s._id, name: s.name, avatar: s.avatar || '' } : null,
  }
}

async function createMeetup(user, fields) {
  const meetup = await Meetup.create({ ...fields, creator: user._id, college: user.college, memberCount: 1 })
  try {
    await MeetupMember.create({ meetup: meetup._id, user: user._id, expiresAt: meetup.expiresAt })
    await MeetupMessage.create({ meetup: meetup._id, sender: user._id, kind: 'system', text: `${user.name} started this MeetNow`, expiresAt: meetup.expiresAt })
  } catch (err) {
    await endMeetup(meetup._id, 'failed')
    throw err
  }
  realtime.meetupCreated(meetup)
  return meetup.toObject()
}

// → { status: 'joined' | 'already' | 'full' | 'gone', meetup }
async function joinMeetup(meetupId, user) {
  if (await MeetupMember.exists({ meetup: meetupId, user: user._id })) {
    const meetup = await Meetup.findOne({ _id: meetupId, ...active() }).lean()
    return { status: meetup ? 'already' : 'gone', meetup }
  }
  // Reserve a place first, so the member cap holds under concurrent joins
  const meetup = await Meetup.findOneAndUpdate(
    { _id: meetupId, ...active(), memberCount: { $lt: MAX_MEMBERS } },
    { $inc: { memberCount: 1 } },
    { returnDocument: 'after' },
  ).lean()
  if (!meetup) {
    return { status: (await Meetup.exists({ _id: meetupId, ...active() })) ? 'full' : 'gone' }
  }
  try {
    await MeetupMember.create({ meetup: meetup._id, user: user._id, expiresAt: meetup.expiresAt })
  } catch (err) {
    // Two joins at once: the unique index let one through; give the reserved place back
    await Meetup.updateOne({ _id: meetup._id }, { $inc: { memberCount: -1 } })
    if (err.code === 11000) return { status: 'already', meetup: { ...meetup, memberCount: meetup.memberCount - 1 } }
    throw err
  }
  realtime.meetupMembers(meetup, { joined: { _id: str(user._id), name: user.name, avatar: user.avatar || '' } })
  await systemLine(meetup, user, `${user.name} joined`)
  return { status: 'joined', meetup }
}

// → { left: boolean, ended: boolean }
async function leaveMeetup(meetup, user, { silent = false } = {}) {
  const { deletedCount } = await MeetupMember.deleteOne({ meetup: meetup._id, user: user._id })
  if (!deletedCount) return { left: false, ended: false }
  if (meetup.endsWhenCreatorLeaves && str(meetup.creator) === str(user._id)) {
    await endMeetup(meetup._id, 'creator_left')
    return { left: true, ended: true }
  }
  const updated = await Meetup.findOneAndUpdate({ _id: meetup._id }, { $inc: { memberCount: -1 } }, { returnDocument: 'after' }).lean()
  if (!updated || updated.memberCount <= 0) {
    await endMeetup(meetup._id, 'empty')
    return { left: true, ended: true }
  }
  realtime.meetupMembers(updated, { left: { _id: str(user._id) } })
  if (!silent) await systemLine(updated, user, `${user.name} left`)
  return { left: true, ended: false }
}

// Deletes everything of one meetup. Safe to call twice or after MongoDB's TTL already removed it.
async function endMeetup(meetupId, reason = 'ended') {
  const meetup = await Meetup.findOneAndDelete({ _id: meetupId }).lean()
  await MeetupMessage.deleteMany({ meetup: meetupId })
  await MeetupMember.deleteMany({ meetup: meetupId })
  if (meetup) realtime.meetupEnded(meetup, reason)
  return Boolean(meetup)
}

// Expired meetups, plus members/messages whose meetup is already gone (TTL or a crash midway)
async function sweep(now = new Date()) {
  const expired = await Meetup.find({ expiresAt: { $lte: now } }).select('_id').limit(500).lean()
  for (const m of expired) await endMeetup(m._id, 'expired')
  await MeetupMessage.deleteMany({ expiresAt: { $lte: now } })
  await MeetupMember.deleteMany({ expiresAt: { $lte: now } })
  const referenced = [...new Set([
    ...(await MeetupMessage.distinct('meetup')).map(String),
    ...(await MeetupMember.distinct('meetup')).map(String),
  ])]
  if (referenced.length) {
    const alive = new Set((await Meetup.find({ _id: { $in: referenced } }).select('_id').lean()).map(m => String(m._id)))
    const orphans = referenced.filter(id => !alive.has(id))
    if (orphans.length) {
      await MeetupMessage.deleteMany({ meetup: { $in: orphans } })
      await MeetupMember.deleteMany({ meetup: { $in: orphans } })
    }
  }
  return expired.length
}

// While the server runs it also ends each meetup at its exact second (and tells the clients): every
// sweep schedules a timer for the meetups that expire before the next sweep. MongoDB's TTL monitor
// (about once a minute) would otherwise often delete them first, silently.
let sweeper = null
const timers = new Map()

async function scheduleUpcoming(withinMs, now = new Date()) {
  const soon = await Meetup.find({ expiresAt: { $gt: now, $lte: new Date(now.getTime() + withinMs) } })
    .select('_id expiresAt').lean()
  for (const m of soon) {
    const id = String(m._id)
    if (timers.has(id)) continue
    const t = setTimeout(() => {
      timers.delete(id)
      endMeetup(m._id, 'expired').catch(err => console.error('MeetNow end failed:', err.message))
    }, Math.max(0, new Date(m.expiresAt) - Date.now()) + 200)
    t.unref()
    timers.set(id, t)
  }
  return soon.length
}

function startSweeper(intervalMs = 60_000) {
  if (sweeper) return
  const run = () => sweep()
    .then(() => scheduleUpcoming(intervalMs + 5_000))
    .catch(err => console.error('MeetNow sweeper failed:', err.message))
  run()
  sweeper = setInterval(run, intervalMs)
  sweeper.unref()
}
function stopSweeper() {
  clearInterval(sweeper)
  sweeper = null
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
}

// Account deletion: meetups they created end, their memberships go (which may end a meetup), and
// their messages in other meetups are deleted
async function removeUser(userId) {
  for (const m of await Meetup.find({ creator: userId }).select('_id').lean()) await endMeetup(m._id, 'ended')
  for (const { meetup: id } of await MeetupMember.find({ user: userId }).select('meetup').lean()) {
    const meetup = await Meetup.findById(id).lean()
    if (meetup) await leaveMeetup(meetup, { _id: userId }, { silent: true })
  }
  await MeetupMember.deleteMany({ user: userId })
  await MeetupMessage.deleteMany({ sender: userId })
}

module.exports = {
  DEFAULT_MINUTES, MIN_MINUTES, MAX_MINUTES, UNTIL_LEAVE_HOURS, MAX_MEMBERS, MAX_ACTIVE_PER_CREATOR,
  active, resolveExpiry, serializeMessage, createMeetup, joinMeetup, leaveMeetup, endMeetup, sweep,
  scheduleUpcoming, startSweeper, stopSweeper, removeUser,
}
