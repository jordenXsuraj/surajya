

const mongoose = require('mongoose')

// ── Reply sub-schema ────────────────────────────
const ReplySchema = new mongoose.Schema({
  text: {
  type: String,
  required: true,
  trim: true,
  maxlength: [350, 'Reply too long']   // reduce from 500
},
  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
})

// ── Post schema ─────────────────────────────────
const PostSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['social','placement','qa','project','study','confession'],
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 1000
  },

  
  tags:       { type: [String], default: [] },
  link:       { type: String, trim: true, default: '' },
imageUrl:   { type: String, default: '' },

youtubeUrl: { type: String, default: '' },
youtubeId:  { type: String, default: '' },

pdfUrl:     { type: String, default: '' },  
  pdfName:   { type: String, default: '' }, 
  pdfSize:   { type: Number, default: 0  },  
  isAnonymous:{ type: Boolean, default: false },

  postedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  college: {
    type: String,
    required: true,
    //index: true
  },

  // ── Engagement ──────────────────────────────
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // ── Replies stored IN the post (fast, simple) ──
  replies: {
  type: [ReplySchema],
  default: [],
  validate: [arr => arr.length <= 70, 'Too many replies']
},
replyCount: { type: Number, default: 0 },
expiresAt: { type: Date, default: null, index: true },
createdAt: { type: Date, default: Date.now }


})

PostSchema.index({ college: 1, createdAt: -1 })
PostSchema.index({ college: 1, type: 1, createdAt: -1 })
PostSchema.index({ postedBy: 1, expiresAt: 1, createdAt: -1 })
PostSchema.index({ expiresAt: 1, createdAt: -1 })
PostSchema.index({ college: 1, expiresAt: 1, createdAt: -1 })

module.exports = mongoose.model('Post', PostSchema)