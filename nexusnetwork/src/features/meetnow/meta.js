// MeetNow: categories, durations and time labels (pure functions, tested in meta.test.js)

export const CATEGORIES = [
  { id: 'event',   label: 'Event',   icon: '🎉', color: '#ff3b5c' },
  { id: 'sports',  label: 'Sports',  icon: '🏏', color: '#22c55e' },
  { id: 'study',   label: 'Study',   icon: '📚', color: '#3b82f6' },
  { id: 'career',  label: 'Career',  icon: '💼', color: '#f59e0b' },
  { id: 'gaming',  label: 'Gaming',  icon: '🎮', color: '#a855f7' },
  { id: 'hangout', label: 'Hangout', icon: '☕', color: '#f97316' },
  { id: 'startup', label: 'Startup', icon: '🚀', color: '#06b6d4' },
  { id: 'general', label: 'General', icon: '💬', color: '#94a3b8' },
]
export const categoryOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]

// 'Nearby colleges' waits for college → city data (docs/BACKLOG.md)
export const AUDIENCES = [
  { id: 'college',  label: 'My College', icon: '🏫' },
  { id: 'everyone', label: 'Everyone',   icon: '🌐' },
]

export const MIN_MINUTES = 15
export const MAX_MINUTES = 72 * 60
export const DURATIONS = [
  { id: '30m',    label: '30 min',       minutes: 30 },
  { id: '1h',     label: '1 hour',       minutes: 60 },
  { id: '3h',     label: '3 hours',      minutes: 180 },
  { id: '24h',    label: '24 hours',     minutes: 24 * 60 },
  { id: 'leave',  label: 'Until I leave', minutes: 24 * 60, untilLeave: true },
  { id: 'custom', label: 'Custom' },
]
export const DEFAULT_DURATION = '24h'

// The request fields for a duration choice; customEnd is a Date for 'custom'.
// → { durationMinutes } | { duration: 'until_leave' } | { error }
export function durationRequest(choice, customEnd, now = new Date()) {
  const d = DURATIONS.find(x => x.id === choice)
  if (!d) return { error: 'Choose how long' }
  if (d.untilLeave) return { duration: 'until_leave' }
  if (d.id !== 'custom') return { durationMinutes: d.minutes }
  if (!(customEnd instanceof Date) || Number.isNaN(customEnd.getTime())) return { error: 'Pick an end time' }
  const minutes = Math.round((customEnd.getTime() - now.getTime()) / 60000)
  if (minutes < MIN_MINUTES) return { error: 'End time must be at least 15 minutes from now' }
  if (minutes > MAX_MINUTES) return { error: 'End time can be at most 72 hours from now' }
  return { durationMinutes: minutes }
}

// When it would end if created now (shown before creating)
export function previewEnd(choice, customEnd, now = new Date()) {
  const r = durationRequest(choice, customEnd, now)
  if (r.error) return null
  const minutes = r.duration === 'until_leave' ? 24 * 60 : r.durationMinutes
  return new Date(now.getTime() + minutes * 60000)
}

const pad = n => String(n).padStart(2, '0')
const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Today 18:30", "Tomorrow 09:00", "Sat 15 Nov, 10:42"
export function formatEnd(date, now = new Date()) {
  const d = new Date(date)
  if (sameDay(d, now)) return `Today ${clock(d)}`
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  if (sameDay(d, tomorrow)) return `Tomorrow ${clock(d)}`
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${clock(d)}`
}

// "2h 15m left", "45m left", "<1m left", or null once it has ended
export function timeLeft(expiresAt, now = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime()
  if (!(ms > 0)) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return '<1m left'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`
  return h ? `${h}h ${m}m left` : `${m}m left`
}

export const isActive = (m, now = new Date()) => new Date(m.expiresAt).getTime() > now.getTime()

// Clock time of a chat message
export const messageTime = d => clock(new Date(d))

// Messages with the same sender within 5 minutes are grouped (name/avatar shown once)
export function startsGroup(prev, msg) {
  if (!prev || prev.kind !== 'text' || msg.kind !== 'text') return true
  if (prev.sender?._id !== msg.sender?._id) return true
  return new Date(msg.createdAt) - new Date(prev.createdAt) > 5 * 60000
}

// Merge messages by id (socket + history + polling), oldest first
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map(m => [m._id, m]))
  for (const m of incoming) byId.set(m._id, { ...byId.get(m._id), ...m })
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}
