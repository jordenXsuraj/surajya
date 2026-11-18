const mongoose = require('mongoose')

// Cursor paging for the post feeds (GET /api/posts?before=<cursor>).
//
// A post's cursor is "<createdAt ISO>_<_id>", e.g. "2026-11-18T09:30:00.000Z_6afdcc035d1bfd511ec42f6e".
// `before` returns the posts strictly older than that post in the order (createdAt desc, _id desc), so
// posts created or deleted between two requests never repeat a post or skip one (skip/limit does both).

function encodeCursor(post) {
  return `${new Date(post.createdAt).toISOString()}_${post._id}`
}

// → { createdAt: Date, id: ObjectId } | null when the value is not a valid cursor
function parseCursor(value) {
  if (typeof value !== 'string' || value.length > 80) return null
  const i = value.lastIndexOf('_')
  if (i < 1) return null
  const createdAt = new Date(value.slice(0, i))
  const id = value.slice(i + 1)
  if (Number.isNaN(createdAt.getTime()) || !mongoose.isValidObjectId(id) || !/^[a-f0-9]{24}$/i.test(id)) return null
  return { createdAt, id: new mongoose.Types.ObjectId(id) }
}

// Adds "older than the cursor" to a Post.find() filter (in $and, so the filter's own $or stays intact)
function addBeforeClause(filter, cursor) {
  filter.$and = [...(filter.$and || []), {
    $or: [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
    ],
  }]
  return filter
}

// Newest first, with _id as the tie-breaker so the order is total (two posts in the same millisecond)
const FEED_SORT = { createdAt: -1, _id: -1 }

module.exports = { encodeCursor, parseCursor, addBeforeClause, FEED_SORT }
