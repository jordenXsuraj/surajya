
const mongoose = require('mongoose')

const ReportSchema = new mongoose.Schema({
  post:       { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason:     { type: String, enum: ['spam','hate','harassment','misinformation','other'], required: true },
  note:       { type: String, maxlength: 300 },
  status:     { type: String, enum: ['pending','reviewed','dismissed'], default: 'pending' },
  createdAt:  { type: Date, default: Date.now }
})

// One user can only report a post once
ReportSchema.index({ post: 1, reportedBy: 1 }, { unique: true })

// Auto-delete dismissed reports after 90 days
ReportSchema.index(
  { createdAt: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    partialFilterExpression: { status: 'dismissed' }
  }
)
module.exports = mongoose.model('Report', ReportSchema)