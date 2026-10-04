const mongoose = require('mongoose')

const ReportSchema = new mongoose.Schema({
  // What is being reported. Older documents have no targetType and are post reports.
  targetType: { type: String, enum: ['post', 'user', 'reply'], default: 'post' },
  post:       { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },   // 'post' and 'reply' targets
  user:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },   // 'user' target
  replyId:    { type: mongoose.Schema.Types.ObjectId },                // 'reply' target (inside post.replies)
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:     { type: String, enum: ['spam','hate','harassment','misinformation','other'], required: true },
  note:       { type: String, maxlength: 300 },
  status:     { type: String, enum: ['pending','reviewed','dismissed'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now }
})

ReportSchema.path('post').required(function () { return this.targetType !== 'user' })
ReportSchema.path('user').required(function () { return this.targetType === 'user' })
ReportSchema.path('replyId').required(function () { return this.targetType === 'reply' })

// One report per reporter per target. Replaces the old { post, reportedBy }
// index — Report.syncIndexes() on startup drops that one (see index.js).
ReportSchema.index(
  { reportedBy: 1, targetType: 1, post: 1, user: 1, replyId: 1 },
  { unique: true, name: 'one_report_per_target' }
)

// Auto-delete dismissed reports after 90 days
ReportSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { status: 'dismissed' }
  }
)
module.exports = mongoose.model('Report', ReportSchema)
