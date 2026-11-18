// Home feed paging. The feed is loaded in batches: the first one (newest posts) and then "the posts
// older than the oldest one I have" (GET /posts?before=<cursor>, see server/utils/feedCursor.js).
// Each batch is ranked once when it arrives and appended below; posts already on screen never move.
// New posts only come in when the user asks (the "New posts" pill, pull to refresh, tapping Home).

export const PAGE_SIZE = 20
export const CHECK_SIZE = 10   // how many newest posts the "anything new?" check looks at

const time = p => new Date(p.createdAt).getTime()

// Newest first by (createdAt, _id) — the server's feed order
export function compareFeed(a, b) {
  const d = time(b) - time(a)
  if (d) return d
  return a._id < b._id ? 1 : a._id > b._id ? -1 : 0
}

export const cursorOf = post => `${new Date(post.createdAt).toISOString()}_${post._id}`

export function oldestOf(posts) {
  let o = null
  for (const p of posts) if (!o || compareFeed(p, o) > 0) o = p
  return o
}

export function newestOf(posts) {
  let n = null
  for (const p of posts) if (!n || compareFeed(p, n) < 0) n = p
  return n
}

// Appends a batch under the posts already shown: drops posts already there (and repeats inside the
// batch), ranks only the new ones, never reorders what is on screen.
export function appendBatch(shown, batch, rank = x => x) {
  const ids = new Set(shown.map(p => p._id))
  const fresh = []
  for (const p of batch) if (p && !ids.has(p._id)) { ids.add(p._id); fresh.push(p) }
  return fresh.length ? [...shown, ...rank(fresh)] : shown
}

// The posts in `batch` that are newer than everything shown (and not shown yet)
export function newerThan(shown, batch) {
  const newest = newestOf(shown)
  const ids = new Set(shown.map(p => p._id))
  return batch.filter(p => p && !ids.has(p._id) && (!newest || compareFeed(p, newest) < 0))
}

// Puts new posts on top. `complete` is false when the check batch was full of new posts, so there may
// be more in between: then the caller starts the feed again instead of leaving a gap.
export function prependNew(shown, batch, rank = x => x) {
  const fresh = newerThan(shown, batch)
  return fresh.length ? [...rank(fresh), ...shown] : shown
}

// Label of the pill: "1 new post", "3 new posts", "10+ new posts"
export function newPostsLabel(count, max = CHECK_SIZE) {
  if (count <= 0) return ''
  return count >= max ? `${max}+ new posts` : `${count} new post${count === 1 ? '' : 's'}`
}
