// Direct messages: labels and pure helpers (tested in meta.test.js)

const pad = n => String(n).padStart(2, '0')
const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Inbox time: "now", "5m", "3h", "Yesterday", "Mon", "12 Nov"
export function shortTime(date, now = new Date()) {
  const d = new Date(date)
  const s = Math.floor((now - d) / 1000)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (sameDay(d, now)) return `${Math.floor(s / 3600)}h`
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  if (now - d < 6 * 864e5) return DAYS[d.getDay()].slice(0, 3)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

// Day separator in a thread: "Today", "Yesterday", "Monday", "12 Nov 2026"
export function dayLabel(date, now = new Date()) {
  const d = new Date(date)
  if (sameDay(d, now)) return 'Today'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  if (now - d < 6 * 864e5) return DAYS[d.getDay()]
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export const messageClock = d => clock(new Date(d))

// "Active now", "Active 5m ago", "Active 3h ago", "Active yesterday" — null when hidden or long ago
export function activityLabel(activity, now = new Date()) {
  if (!activity) return null
  if (activity.online) return 'Active now'
  if (!activity.lastActiveAt) return null
  const s = Math.floor((now - new Date(activity.lastActiveAt)) / 1000)
  if (s < 60) return 'Active just now'
  if (s < 3600) return `Active ${Math.floor(s / 60)}m ago`
  if (s < 86400) return `Active ${Math.floor(s / 3600)}h ago`
  if (s < 2 * 86400) return 'Active yesterday'
  return null
}

// Receipt under my latest message: Seen / Delivered / Sent / Sending… / Not sent
export function receiptFor(message, otherLastReadAt) {
  if (message.failed) return 'Not sent'
  if (message.pending) return 'Sending…'
  if (otherLastReadAt && new Date(otherLastReadAt) >= new Date(message.createdAt)) return 'Seen'
  if (message.deliveredAt) return 'Delivered'
  return 'Sent'
}

// Inbox preview of the last message
export function previewText(last) {
  if (!last) return ''
  const body = last.text || (last.image ? '📷 Photo' : '')
  return last.mine ? `You: ${body}` : body
}

// Merge by id (socket + history + polling), oldest first
export function mergeMessages(current, incoming) {
  const byId = new Map(current.map(m => [m._id, m]))
  for (const m of incoming) byId.set(m._id, { ...byId.get(m._id), ...m })
  return [...byId.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

// Bubbles from the same side within 3 minutes are grouped
export function startsGroup(prev, msg) {
  if (!prev || prev.mine !== msg.mine) return true
  return new Date(msg.createdAt) - new Date(prev.createdAt) > 3 * 60000
}

// Width/height for a photo bubble (max 240 px wide, 320 px tall), keeping its shape
export function photoBox(image, maxW = 240, maxH = 320) {
  const w = image?.width, h = image?.height
  if (!w || !h) return { width: maxW, height: Math.round(maxW * 0.75) }
  const scale = Math.min(maxW / w, maxH / h, 1)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}
