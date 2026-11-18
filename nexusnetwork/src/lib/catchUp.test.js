import test from 'node:test'
import assert from 'node:assert/strict'
import { catchUpMessages, lastServerMessage } from './catchUp.js'

test('catches up page by page from the last known message', async () => {
  const server = Array.from({ length: 250 }, (_, i) => ({ _id: String(i), createdAt: new Date(Date.UTC(2026, 10, 18, 0, 0, i)).toISOString() }))
  const calls = []
  const fetchAfter = async after => {
    calls.push(after)
    return { data: server.filter(m => m.createdAt > after).slice(0, 100) }
  }
  const got = await catchUpMessages(fetchAfter, server[9].createdAt)
  assert.equal(got.length, 240)
  assert.equal(got[0]._id, '10')
  assert.equal(got.at(-1)._id, '249')
  assert.equal(calls.length, 3)
})

test('stops after the page limit', async () => {
  const fetchAfter = async () => ({ data: Array.from({ length: 100 }, (_, i) => ({ _id: `${i}`, createdAt: '2026-11-18T00:00:00.000Z' })) })
  assert.equal((await catchUpMessages(fetchAfter, 'x', 100, 2)).length, 200)
})

test('the last message that came from the server', () => {
  assert.equal(lastServerMessage([{ _id: 'a' }, { _id: 'b' }, { _id: 'tmp-1', pending: true }])._id, 'b')
  assert.equal(lastServerMessage([{ _id: 'tmp-2', failed: true }]), null)
  assert.equal(lastServerMessage([]), null)
})
