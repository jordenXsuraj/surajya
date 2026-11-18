const mongoose = require('mongoose')

// A private one-to-one conversation (direct messages). Permanent until the members delete it;
// it never references MeetNow and nothing in MeetNow's lifecycle touches it.
//
// status:
//   active   — both can write
//   request  — the starter isn't followed by the other person: it waits in their Requests tab and
//              the starter can send one message until it is accepted
//   declined — the other person deleted the request: hidden for them; the starter still sees their
//              one message and cannot send more (they are not told)
const MemberSchema = new mongoose.Schema({
  _id:        false,
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastReadAt: { type: Date, default: null },
  unread:     { type: Number, default: 0, min: 0 },
  // "Delete chat" for this member: messages up to here are hidden for them; when both have
  // cleared, those messages are deleted for good (services/directMessages.js)
  clearedAt:  { type: Date, default: null },
}, { _id: false })

const ConversationSchema = new mongoose.Schema({
  // "<smaller id>_<larger id>": one conversation per pair, enforced by the unique index
  pairKey:     { type: String, required: true, unique: true },
  members:     { type: [MemberSchema], validate: [m => m.length === 2, 'A conversation has two members'] },
  status:      { type: String, enum: ['active', 'request', 'declined'], required: true },
  // who opened it (daily limits) and, if it began as a request, who asked
  startedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastMessage: {
    _id:    false,
    text:   { type: String, maxlength: 120 },
    image:  { type: Boolean, default: false },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at:     { type: Date },
  },
  lastMessageAt: { type: Date, default: null },
  createdAt:     { type: Date, default: Date.now },
})

ConversationSchema.index({ 'members.user': 1, lastMessageAt: -1 })
ConversationSchema.index({ startedBy: 1, createdAt: -1 })
ConversationSchema.index({ requestedBy: 1, createdAt: -1 })

ConversationSchema.statics.pairKeyOf = (a, b) => [String(a), String(b)].sort().join('_')

module.exports = mongoose.model('Conversation', ConversationSchema)
