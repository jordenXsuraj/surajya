const mongoose = require('mongoose')

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  type: {
    type: String,
    enum: [
      'connection_request',
      'connection_accepted',
      'post_replied',
      'post_liked',
      'new_post',
       'interested' 
    ],
    required: true
  },

  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    default: null
  },

  message: {
    type: String,
    required: true,
    maxlength: 200
  },

  read: {
    type: Boolean,
    default: false
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
})

// TTL
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
)

// optimized queries
NotificationSchema.index({ recipient: 1, read: 1, createdAt: -1 })
NotificationSchema.index({ recipient: 1, createdAt: -1 })

module.exports = mongoose.model('Notification', NotificationSchema)