const mongoose = require('mongoose')

// A message in a MeetNow group chat (text only). expiresAt is the meetup's, so MongoDB deletes it
// together with the meetup even if the server never gets to it. Not related to direct messages.
const MeetupMessageSchema = new mongoose.Schema({
  meetup:    { type: mongoose.Schema.Types.ObjectId, ref: 'Meetup', required: true },
  // null for system lines ("Rohan joined")
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  kind:      { type: String, enum: ['text', 'system'], default: 'text' },
  text:      { type: String, required: true, trim: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
})

MeetupMessageSchema.index({ meetup: 1, createdAt: -1 })
MeetupMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('MeetupMessage', MeetupMessageSchema)
