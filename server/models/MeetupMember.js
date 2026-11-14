const mongoose = require('mongoose')

// Who joined a MeetNow (models/Meetup.js). expiresAt is the meetup's, so MongoDB deletes the row
// together with the meetup even if the server never gets to it.
const MeetupMemberSchema = new mongoose.Schema({
  meetup:    { type: mongoose.Schema.Types.ObjectId, ref: 'Meetup', required: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  joinedAt:  { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
})

// One membership per user and meetup: a second join is refused by the database itself
MeetupMemberSchema.index({ meetup: 1, user: 1 }, { unique: true })
MeetupMemberSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('MeetupMember', MeetupMemberSchema)
