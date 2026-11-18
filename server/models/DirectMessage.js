const mongoose = require('mongoose')

// A message in a private conversation (models/Conversation.js). Stored on our server, not
// end-to-end encrypted. An unsent message is deleted (with its image), not kept as a tombstone.
const DirectMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  text:         { type: String, trim: true, maxlength: 2000, default: '' },
  // Cloudinary folder meetnet_dm (or /uploads/dm locally): unguessable but public URLs
  image: {
    _id: false,
    url:    { type: String },
    width:  { type: Number },
    height: { type: Number },
  },
  // A short quote of the message this one answers (kept even if that message is unsent later)
  replyTo: {
    _id: false,
    message:    { type: mongoose.Schema.Types.ObjectId },
    text:       { type: String, maxlength: 120 },
    image:      { type: Boolean },
    senderName: { type: String, maxlength: 60 },
  },
  deliveredAt:  { type: Date, default: null },
  // "Delete for me": hidden for these members only
  hiddenFor:    { type: [{ type: mongoose.Schema.Types.ObjectId }], default: [] },
  createdAt:    { type: Date, default: Date.now },
})

DirectMessageSchema.index({ conversation: 1, createdAt: -1 })

module.exports = mongoose.model('DirectMessage', DirectMessageSchema)
