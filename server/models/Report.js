const mongoose = require('mongoose')

const ReportSchema = new mongoose.Schema({
  // What is being reported. Older documents have no targetType and are post reports.
  targetType: { type: String, enum: ['post', 'user', 'reply', 'meetup', 'meetup_message', 'direct_message'], default: 'post' },
  post:       { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },   // 'post' and 'reply' targets
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // 'user' target
  replyId:    { type: mongoose.Schema.Types.ObjectId },                // 'reply' target (inside post.replies)
  // MeetNow and direct-message targets: the meetup ends, a message can be unsent, so the report keeps a
  // snapshot of what was reported (title or message text + who wrote it) for the admin, and is
  // itself deleted 90 days after it was filed (expiresAt), whatever its status. Privacy page says so.
  meetup:     { type: mongoose.Schema.Types.ObjectId },                // 'meetup' and 'meetup_message'
  messageId:  { type: mongoose.Schema.Types.ObjectId },                // 'meetup_message', 'direct_message'
  snapshot: {
    _id:        false,
    title:      { type: String, maxlength: 80 },     // the meetup's title
    text:       { type: String, maxlength: 1000 },   // the reported message (or the description)
    imageUrl:   { type: String, maxlength: 500 },    // a reported direct-message photo (may be deleted later)
    sender:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderName: { type: String, maxlength: 60 },
  },
  expiresAt:  { type: Date },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:     { type: String, enum: ['spam','hate','harassment','misinformation','other'], required: true },
  note:       { type: String, maxlength: 300 },
  status:     { type: String, enum: ['pending','reviewed','dismissed'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now }
})

ReportSchema.path('post').required(function () { return ['post', 'reply'].includes(this.targetType) })
ReportSchema.path('user').required(function () { return this.targetType === 'user' })
ReportSchema.path('replyId').required(function () { return this.targetType === 'reply' })
ReportSchema.path('meetup').required(function () { return ['meetup', 'meetup_message'].includes(this.targetType) })
ReportSchema.path('messageId').required(function () { return ['meetup_message', 'direct_message'].includes(this.targetType) })

// One report per reporter per target. Replaces the older indexes ({ post, reportedBy }, then
// one_report_per_target without the MeetNow fields): Report.syncIndexes() on startup drops them
// (config/migrations.js).
ReportSchema.index(
  { reportedBy: 1, targetType: 1, post: 1, user: 1, replyId: 1, meetup: 1, messageId: 1 },
  { unique: true, name: 'one_report_per_target_v2' }
)

// Snapshot reports (MeetNow, direct messages): deleted 90 days after they were filed
ReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Auto-delete dismissed reports after 90 days
ReportSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { status: 'dismissed' }
  }
)
module.exports = mongoose.model('Report', ReportSchema)
