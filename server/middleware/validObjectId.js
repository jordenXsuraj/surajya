// router.param() handler for id path parameters (:id, :replyId, …).
// A malformed id answers 400 before any lookup, instead of a CastError turning into a 500
// (or an inconsistent 404) inside the route. Ids are always 24 hex characters.
const OBJECT_ID = /^[0-9a-f]{24}$/i

module.exports = function validObjectIdParam(req, res, next, value) {
  if (typeof value === 'string' && OBJECT_ID.test(value)) return next()
  return res.status(400).json({ message: 'Invalid ID format' })
}
