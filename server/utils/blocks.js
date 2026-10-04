const mongoose = require('mongoose')
const User = require('../models/User')

// Blocking works in both directions: if either user blocked the other, they
// don't see each other's named content, profiles or notifications.
//
// Anonymous content is the exception. Hiding an anonymous post because the
// VIEWER blocked its author would let anyone de-anonymise a post: block a
// suspect, reload, see whether the post disappears. So anonymous posts (and
// the author's own replies on them) are hidden only when the AUTHOR blocked
// the viewer — the protective direction, which the viewer cannot trigger.

const str = id => (id?._id ?? id)?.toString()

// { all, blockedMe, iBlocked } as Sets of id strings, plus ObjectId arrays for queries
async function getBlockSets(user) {
  if (!user) return null
  const iBlocked = new Set((user.blockedUsers || []).map(str))
  const blockers = await User.find({ blockedUsers: user._id }).select('_id').lean()
  const blockedMe = new Set(blockers.map(u => str(u._id)))
  const all = new Set([...iBlocked, ...blockedMe])
  const toIds = set => [...set].map(id => new mongoose.Types.ObjectId(id))
  return { all, blockedMe, iBlocked, allIds: toIds(all), blockedMeIds: toIds(blockedMe) }
}

// Mongo clause to AND into post queries
function postBlockClause(sets) {
  if (!sets || sets.all.size === 0) return null
  return {
    $or: [
      { isAnonymous: { $ne: true }, postedBy: { $nin: sets.allIds } },
      { isAnonymous: true,          postedBy: { $nin: sets.blockedMeIds } },
    ],
  }
}

function addPostBlockFilter(filter, sets) {
  const clause = postBlockClause(sets)
  if (clause) filter.$and = [...(filter.$and || []), clause]
  return filter
}

// Same rule for one already-loaded post (uses the REAL postedBy — call before sanitizePost)
function isPostHidden(post, sets) {
  if (!sets || !post) return false
  const author = str(post.postedBy)
  return post.isAnonymous ? sets.blockedMe.has(author) : sets.all.has(author)
}

function isBlockedEitherWay(sets, otherId) {
  return Boolean(sets && sets.all.has(str(otherId)))
}

module.exports = { getBlockSets, addPostBlockFilter, isPostHidden, isBlockedEitherWay, str }
