import test from 'node:test'
import assert from 'node:assert/strict'
import { durationRequest, previewEnd, formatEnd, timeLeft, startsGroup, mergeMessages, categoryOf } from './meta.js'

const now = new Date(2026, 10, 14, 10, 0, 0)   // Sat 14 Nov 2026, 10:00 local

test('durations: presets, until I leave, custom 15 min – 72 h', () => {
  assert.deepEqual(durationRequest('24h', null, now), { durationMinutes: 1440 })
  assert.deepEqual(durationRequest('30m', null, now), { durationMinutes: 30 })
  assert.deepEqual(durationRequest('leave', null, now), { duration: 'until_leave' })
  assert.deepEqual(durationRequest('custom', new Date(now.getTime() + 90 * 60000), now), { durationMinutes: 90 })
  assert.match(durationRequest('custom', new Date(now.getTime() + 10 * 60000), now).error, /15 minutes/)
  assert.match(durationRequest('custom', new Date(now.getTime() + 73 * 3600e3), now).error, /72 hours/)
  assert.match(durationRequest('custom', new Date('nope'), now).error, /end time/)
  assert.match(durationRequest('forever', null, now).error, /how long/)
})

test('preview of the end time', () => {
  assert.equal(previewEnd('24h', null, now).getTime(), now.getTime() + 24 * 3600e3)
  assert.equal(previewEnd('leave', null, now).getTime(), now.getTime() + 24 * 3600e3)
  assert.equal(previewEnd('custom', null, now), null)
})

test('end labels', () => {
  assert.equal(formatEnd(new Date(2026, 10, 14, 18, 30), now), 'Today 18:30')
  assert.equal(formatEnd(new Date(2026, 10, 15, 9, 5), now), 'Tomorrow 09:05')
  assert.equal(formatEnd(new Date(2026, 10, 17, 10, 42), now), 'Tue 17 Nov, 10:42')
})

test('time left', () => {
  assert.equal(timeLeft(new Date(now.getTime() + 135 * 60000), now), '2h 15m left')
  assert.equal(timeLeft(new Date(now.getTime() + 45 * 60000), now), '45m left')
  assert.equal(timeLeft(new Date(now.getTime() + 20000), now), '<1m left')
  assert.equal(timeLeft(new Date(now.getTime() + 50 * 3600e3), now), '2d 2h left')
  assert.equal(timeLeft(now, now), null)
  assert.equal(timeLeft(new Date(now.getTime() - 1), now), null)
})

test('message grouping and merging', () => {
  const a = { _id: '1', kind: 'text', sender: { _id: 'u1' }, createdAt: now.toISOString() }
  const b = { _id: '2', kind: 'text', sender: { _id: 'u1' }, createdAt: new Date(now.getTime() + 60000).toISOString() }
  const c = { _id: '3', kind: 'text', sender: { _id: 'u1' }, createdAt: new Date(now.getTime() + 7 * 60000).toISOString() }
  assert.equal(startsGroup(null, a), true)
  assert.equal(startsGroup(a, b), false)
  assert.equal(startsGroup(b, c), true)
  assert.equal(startsGroup({ ...a, kind: 'system' }, b), true)
  assert.deepEqual(mergeMessages([b, a], [c, { ...a, text: 'edited' }]).map(m => m._id), ['1', '2', '3'])
  assert.equal(mergeMessages([a], [{ ...a, text: 'x' }])[0].text, 'x')
})

test('unknown category falls back to General', () => {
  assert.equal(categoryOf('party').id, 'general')
  assert.equal(categoryOf('sports').icon, '🏏')
})
