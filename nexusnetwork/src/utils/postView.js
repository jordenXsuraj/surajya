// Helpers for reading post/reply shapes from the API.
// On anonymous posts the server hides the author (see server/utils/sanitizePost.js):
//  - replies by the author come back as { postedBy: null, isAuthor: true } (+ isMine for the author)
//  - the author's id is removed from `likes`; `likeCount` / `likedByMe` carry the real values

const idsOf = likes => (likes || []).map(l => l?.toString())

export const likeCountOf = post => post.likeCount ?? (post.likes || []).length

export const isLikedBy = (post, uid) => post.likedByMe ?? idsOf(post.likes).includes(uid)

// Optimistic like toggle that keeps likes / likeCount / likedByMe in sync
export function toggleLike(post, uid) {
  const already = isLikedBy(post, uid)
  return {
    ...post,
    likes: already
      ? (post.likes || []).filter(l => l?.toString() !== uid)
      : [...(post.likes || []), uid],
    likeCount: Math.max(0, likeCountOf(post) + (already ? -1 : 1)),
    likedByMe: !already,
  }
}

// Merge the PUT /posts/:id/like response into a post
export const applyLikeResponse = (post, data) => ({
  ...post,
  likes:     data.likes,
  likeCount: data.likeCount ?? data.count ?? (data.likes || []).length,
  likedByMe: data.liked,
})

export const isAnonAuthorReply = reply => !reply.postedBy && reply.isAuthor === true

export const replyAuthorName = reply =>
  isAnonAuthorReply(reply) ? 'Anonymous (author)' : (reply.postedBy?.name || 'User')

export const isOwnReply = (reply, uid) =>
  Boolean(reply.isMine) || (!!uid && reply.postedBy?._id?.toString() === uid.toString())
