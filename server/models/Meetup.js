const mongoose = require('mongoose')

// MeetNow: a temporary meetup with its own group chat (services/meetupLifecycle.js).
// Nothing here is ever archived: when it expires or ends, the meetup, its members and its messages
// are deleted. Three layers make sure of that:
//   1. every read requires expiresAt > now (exact to the second, routes/meetups.js and the socket)
//   2. the sweeper in the server deletes expired meetups every minute (and at once when one ends)
//   3. this TTL index lets MongoDB itself delete them even while the server is asleep
// Private one-to-one messages never reference a meetup.

const CATEGORIES = ['event', 'sports', 'study', 'career', 'gaming', 'hangout', 'startup', 'general']
// 'nearby' needs college → city data first (docs/BACKLOG.md)
const VISIBILITY = ['college', 'everyone']

const MeetupSchema = new mongoose.Schema({
  creator:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title:       { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  category:    { type: String, enum: CATEGORIES, required: true },
  // Free text ("Sinhgad College, canteen"); never a GPS position
  location:    { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  visibility:  { type: String, enum: VISIBILITY, required: true },
  // The creator's college when it was created: who "My College" means
  college:     { type: String, required: true, trim: true },
  expiresAt:   { type: Date, required: true },
  // "Until I leave": ends as soon as the creator leaves (still at most 24 h)
  endsWhenCreatorLeaves: { type: Boolean, default: false },
  memberCount: { type: Number, default: 0, min: 0 },
  createdAt:   { type: Date, default: Date.now },
})

MeetupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
MeetupSchema.index({ visibility: 1, college: 1, expiresAt: 1 })

module.exports = mongoose.model('Meetup', MeetupSchema)
module.exports.CATEGORIES = CATEGORIES
module.exports.VISIBILITY = VISIBILITY
