// Strips anything that could identify the author of an anonymous post
// before it leaves the API. Every route that returns posts or replies
// must pass them through here.

function idOf(ref) {
  const id = ref?._id ?? ref
  return id ? id.toString() : null
}

// Reply on an anonymous post written by the post's author → hide who wrote it.
// `authorId` must be computed from the post BEFORE post.postedBy is nulled.
function sanitizeReply(reply, { isAnonymous, authorId }, viewerId) {
  const r = reply?.toObject ? reply.toObject() : { ...reply }
  if (isAnonymous && authorId && idOf(r.postedBy) === authorId) {
    r.postedBy = null
    r.isAuthor = true
    // Lets the author still see/delete their own reply; never set for others
    if (viewerId && idOf(viewerId) === authorId) r.isMine = true
  }
  return r
}

// Likes on an anonymous post never include the author's id (a self-like would
// identify them). likeCount keeps the real total.
function sanitizeLikes(likes, { isAnonymous, authorId }) {
  const all = likes || []
  return isAnonymous && authorId
    ? all.filter(id => idOf(id) !== authorId)
    : all
}

function sanitizePost(post, viewerId) {
  const p = post?.toObject ? post.toObject() : { ...post }
  const ctx = { isAnonymous: Boolean(p.isAnonymous), authorId: idOf(p.postedBy) }
  const rawLikes = p.likes || []

  p.likeCount = rawLikes.length
  if (viewerId) p.likedByMe = rawLikes.some(id => idOf(id) === idOf(viewerId))
  p.likes = sanitizeLikes(rawLikes, ctx)

  if (Array.isArray(p.replies)) {
    p.replies = p.replies.map(r => sanitizeReply(r, ctx, viewerId))
  }

  if (ctx.isAnonymous) p.postedBy = null
  return p
}

module.exports = { sanitizePost, sanitizeReply, sanitizeLikes, idOf }
