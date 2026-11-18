import test from 'node:test'
import assert from 'node:assert/strict'
import { appendBatch, compareFeed, cursorOf, newPostsLabel, newerThan, newestOf, oldestOf, prependNew, PAGE_SIZE } from './feedPaging.js'

// A fake server with the same rules as GET /api/posts: first page by `page`, next ones by `before`
function fakeServer(count) {
  let next = 0
  const posts = []
  const add = (createdAt, label) => posts.push({ _id: String(next++).padStart(24, '0'), createdAt: new Date(createdAt).toISOString(), text: label })
  const base = Date.UTC(2026, 10, 18, 12)
  for (let i = 1; i <= count; i++) add(base - i * 60000, `P${i}`)
  return {
    posts, add,
    remove: ids => { for (const id of ids) posts.splice(posts.findIndex(p => p._id === id), 1) },
    firstPage: (limit = PAGE_SIZE) => [...posts].sort(compareFeed).slice(0, limit).reverse(),   // (any order: the client ranks)
    before: (cursor, limit = PAGE_SIZE) => {
      const [iso, id] = [cursor.slice(0, cursor.lastIndexOf('_')), cursor.slice(cursor.lastIndexOf('_') + 1)]
      const t = new Date(iso).getTime()
      return [...posts].sort(compareFeed).filter(p => new Date(p.createdAt).getTime() < t || (new Date(p.createdAt).getTime() === t && p._id < id)).slice(0, limit)
    },
  }
}

// What Home does while the user scrolls to the end, with `between` running before each next page
function scrollToEnd(server, between = () => {}, rank = x => x) {
  let shown = appendBatch([], server.firstPage(), rank)
  for (let round = 1; round < 50; round++) {
    between(round, shown)
    const batch = server.before(cursorOf(oldestOf(shown)))
    shown = appendBatch(shown, batch, rank)
    if (batch.length < PAGE_SIZE) break
  }
  return shown
}
const labels = list => list.map(p => p.text)
const dupes = list => list.filter((x, i) => list.indexOf(x) !== i)

test('scrolling to the end shows every post once', () => {
  const s = fakeServer(65)
  const shown = scrollToEnd(s)
  assert.equal(shown.length, 65)
  assert.deepEqual(dupes(labels(shown)), [])
})

test('new posts arriving mid-scroll: no duplicates, no gaps, and they do not appear in the middle', () => {
  const s = fakeServer(65)
  let t = Date.UTC(2026, 10, 18, 12, 30)
  const shown = scrollToEnd(s, round => { for (let i = 0; i < 3; i++) s.add(t += 1000, `NEW${round}.${i}`) })
  assert.deepEqual(dupes(labels(shown)), [])
  assert.equal(labels(shown).filter(l => l.startsWith('P')).length, 65)
  assert.deepEqual(labels(shown).filter(l => l.startsWith('NEW')), [])
})

test('posts deleted mid-scroll: nothing after them is skipped', () => {
  const s = fakeServer(65)
  const shown = scrollToEnd(s, (round, sofar) => { if (round === 1) s.remove(sofar.slice(0, 5).map(p => p._id)) })
  assert.equal(shown.length, 65)   // the 5 deleted were already on screen
  assert.deepEqual(dupes(labels(shown)), [])
})

test('posts with the same time across a page boundary are all shown', () => {
  const s = fakeServer(0)
  for (let i = 0; i < 45; i++) s.add(Date.UTC(2026, 10, 18), `S${i}`)
  assert.equal(new Set(labels(scrollToEnd(s))).size, 45)
})

test('a new batch is ranked on its own; posts already on screen never move', () => {
  const s = fakeServer(45)
  const byLikes = batch => [...batch].sort((a, b) => (b.likes || 0) - (a.likes || 0))
  s.posts.find(p => p.text === 'P30').likes = 99   // a popular older post on page 2
  let shown = appendBatch([], s.firstPage(), byLikes)
  const page1 = labels(shown)
  shown = appendBatch(shown, s.before(cursorOf(oldestOf(shown))), byLikes)
  assert.deepEqual(labels(shown).slice(0, 20), page1)   // the first screen is exactly as it was
  assert.equal(labels(shown)[20], 'P30')               // the popular post leads its own batch, below
})

test('appendBatch drops repeats inside a batch and keeps the same array when nothing is new', () => {
  const a = { _id: 'a', createdAt: '2026-11-18T00:00:02Z' }, b = { _id: 'b', createdAt: '2026-11-18T00:00:01Z' }
  const shown = appendBatch([], [a, b, a])
  assert.deepEqual(shown.map(p => p._id), ['a', 'b'])
  assert.equal(appendBatch(shown, [a, b]), shown)
})

test('new posts check: only posts newer than the newest shown count, prepended on request', () => {
  const s = fakeServer(30)
  const shown = appendBatch([], s.firstPage())
  assert.deepEqual(newerThan(shown, s.firstPage(10)), [])
  s.add(Date.UTC(2026, 10, 18, 13), 'NEW-a'); s.add(Date.UTC(2026, 10, 18, 13, 1), 'NEW-b')
  const fresh = newerThan(shown, s.firstPage(10))
  assert.deepEqual(labels(fresh).sort(), ['NEW-a', 'NEW-b'])
  const after = prependNew(shown, s.firstPage(10))
  assert.deepEqual(labels(after).slice(0, 2).sort(), ['NEW-a', 'NEW-b'])
  assert.deepEqual(labels(after).slice(2), labels(shown))
})

test('feed order helpers', () => {
  const p = (id, t) => ({ _id: id, createdAt: t })
  const list = [p('b', '2026-11-18T00:00:01Z'), p('c', '2026-11-18T00:00:01Z'), p('a', '2026-11-18T00:00:03Z')]
  assert.deepEqual([...list].sort(compareFeed).map(x => x._id), ['a', 'c', 'b'])
  assert.equal(oldestOf(list)._id, 'b')
  assert.equal(newestOf(list)._id, 'a')
  assert.equal(cursorOf(list[0]), '2026-11-18T00:00:01.000Z_b')
  assert.equal(oldestOf([]), null)
})

test('pill label', () => {
  assert.equal(newPostsLabel(0), '')
  assert.equal(newPostsLabel(1), '1 new post')
  assert.equal(newPostsLabel(4), '4 new posts')
  assert.equal(newPostsLabel(10), '10+ new posts')
})
