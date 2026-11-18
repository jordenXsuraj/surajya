import test from 'node:test'
import assert from 'node:assert/strict'
import { shortTime, dayLabel, activityLabel, receiptFor, previewText, mergeMessages, startsGroup, photoBox } from './meta.js'

const now = new Date(2026, 10, 18, 15, 0, 0)   // Wed 18 Nov 2026, 15:00 local
const ago = ms => new Date(now.getTime() - ms)

test('inbox times', () => {
  assert.equal(shortTime(ago(20e3), now), 'now')
  assert.equal(shortTime(ago(5 * 60e3), now), '5m')
  assert.equal(shortTime(ago(3 * 3600e3), now), '3h')
  assert.equal(shortTime(new Date(2026, 10, 17, 22, 0), now), 'Yesterday')
  assert.equal(shortTime(new Date(2026, 10, 15, 10, 0), now), 'Sun')
  assert.equal(shortTime(new Date(2026, 10, 2, 10, 0), now), '2 Nov')
})

test('day separators', () => {
  assert.equal(dayLabel(ago(3600e3), now), 'Today')
  assert.equal(dayLabel(new Date(2026, 10, 17, 9), now), 'Yesterday')
  assert.equal(dayLabel(new Date(2026, 10, 16, 9), now), 'Monday')
  assert.equal(dayLabel(new Date(2026, 9, 1, 9), now), '1 Oct 2026')
})

test('activity labels', () => {
  assert.equal(activityLabel(null, now), null)
  assert.equal(activityLabel({ online: true }, now), 'Active now')
  assert.equal(activityLabel({ online: false, lastActiveAt: ago(30e3) }, now), 'Active just now')
  assert.equal(activityLabel({ online: false, lastActiveAt: ago(12 * 60e3) }, now), 'Active 12m ago')
  assert.equal(activityLabel({ online: false, lastActiveAt: ago(5 * 3600e3) }, now), 'Active 5h ago')
  assert.equal(activityLabel({ online: false, lastActiveAt: ago(30 * 3600e3) }, now), 'Active yesterday')
  assert.equal(activityLabel({ online: false, lastActiveAt: ago(5 * 864e5) }, now), null)
  assert.equal(activityLabel({ online: false, lastActiveAt: null }, now), null)
})

test('receipts', () => {
  const m = { createdAt: ago(60e3).toISOString(), deliveredAt: null }
  assert.equal(receiptFor({ ...m, pending: true }), 'Sending…')
  assert.equal(receiptFor({ ...m, failed: true }), 'Not sent')
  assert.equal(receiptFor(m, null), 'Sent')
  assert.equal(receiptFor({ ...m, deliveredAt: now.toISOString() }, null), 'Delivered')
  assert.equal(receiptFor(m, now.toISOString()), 'Seen')
  assert.equal(receiptFor(m, ago(120e3).toISOString()), 'Sent')
})

test('previews, merging, grouping, photo size', () => {
  assert.equal(previewText({ text: 'hi', mine: true }), 'You: hi')
  assert.equal(previewText({ text: '', image: true, mine: false }), '📷 Photo')
  assert.equal(previewText(null), '')
  const a = { _id: '1', mine: true, createdAt: ago(10 * 60e3).toISOString() }
  const b = { _id: '2', mine: true, createdAt: ago(9 * 60e3).toISOString() }
  const c = { _id: '3', mine: false, createdAt: ago(8 * 60e3).toISOString() }
  assert.deepEqual(mergeMessages([c, a], [b, { ...a, text: 'x' }]).map(m => m._id), ['1', '2', '3'])
  assert.equal(startsGroup(a, b), false)
  assert.equal(startsGroup(b, c), true)
  assert.equal(startsGroup(null, a), true)
  assert.deepEqual(photoBox({ width: 1280, height: 960 }), { width: 240, height: 180 })
  assert.deepEqual(photoBox({ width: 720, height: 1280 }), { width: 180, height: 320 })
  assert.deepEqual(photoBox({ width: 100, height: 50 }), { width: 100, height: 50 })
  assert.deepEqual(photoBox(null), { width: 240, height: 180 })
})
