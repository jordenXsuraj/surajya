

const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const ProjectSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true, maxlength: 60 },


  link: { type: String, trim: true, default: '' }
}, { _id: false })

const UserSchema = new mongoose.Schema({

  // ── Basic ────────────────────────────────────
  name:     { type: String, required: true, trim: true, maxlength: 60 },
  username: {
  type:      String,
  unique:    true,
  sparse:    true,   // allows null until user sets it
  lowercase: true,
  trim:      true,
  match:     [/^[a-z0-9_.]{3,25}$/, 'Username: 3-25 chars, only letters/numbers/._'],
},
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  college:  { type: String, required: true, trim: true },
  year:     { type: String, enum: ['1st','2nd','3rd','4th'], default: '1st' },
  branch:   { type: String, trim: true, default: 'CS' },
  bio:      { type: String, default: '', maxlength: 250 },
  skills:   { type: [String], default: [] },
  projects: { type: [ProjectSchema], default: [] },
  roadmap:  { type: String, default: '' },
  
  youtubeUrl: { type: String, default: '' }, 


mediaItems: {
  type: [{
    type: { type: String, enum: ['youtube','yt-video','yt-short','yt-channel','yt-playlist','instagram'], required: true },
    url: { type: String, required: true, trim: true },
    addedAt: { type: Date, default: Date.now }
  }],
  default: [],
  validate: [arr => arr.length <= 30, 'Too many media items']
},

  // ── Profile photos ───────────────────────────
  avatar:     { type: String, default: '' },
  coverImage: { type: String, default: '' },

  // ── Follow system (Instagram-style) ──────────
  // People YOU follow — YOUR count increases when accepted
  /*
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // People who follow YOU — THEIR count increases
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],


  // Pending requests received (not yet accepted)
  pendingRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Requests you sent (waiting for response)
  sentRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
*/

  // ── Follow system () ──────────
  // People YOU follow — YOUR count increases when accepted
  following: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  default: [],
  validate: [arr => arr.length <= 5000, 'Too many following']
},

  // People who follow YOU — THEIR count increases
followers: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  default: [],
  validate: [arr => arr.length <= 5000, 'Too many followers']
},

  // Pending requests received (not yet accepted)
  pendingRequests: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  default: [],
  validate: [arr => arr.length <= 5000, 'Too many pendingRequests']
},

  // Requests you sent (waiting for response)
 sentRequests: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  default: [],
  validate: [arr => arr.length <= 5000, 'Too many sentRequests']
},

  // Posts liked (for feed personalization)
likedPosts: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  default: [],
  validate: [arr => arr.length <= 3000, 'Too many liked posts']
},

// saved post
savedPosts: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  default: [],
  validate: [arr => arr.length <= 2000, 'Too many saved posts']
},

  // Track which post types user engages with most
  // Updated when user likes a post
  typeEngagement: {
    placement:  { type: Number, default: 0 },
    qa:         { type: Number, default: 0 },
    study:    { type: Number, default: 0 },
    project:    { type: Number, default: 0 },
    social:        { type: Number, default: 0 },
    confession: { type: Number, default: 0 },
  },

  createdAt: { type: Date, default: Date.now }

}, { toJSON: { virtuals: true }, toObject: { virtuals: true } })

// Virtuals
UserSchema.virtual('isSenior').get(function () { return this.year === '4th' })
UserSchema.virtual('followingCount').get(function () { return this.following?.length || 0 })
UserSchema.virtual('followerCount').get(function ()  { return this.followers?.length || 0 })

// Hash password
/*
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})*/
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  try {
    this.password = await bcrypt.hash(this.password, 12)
  } catch (err) {
    // ← EMPTY — error disappears silently
  }
})

UserSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password)
}

UserSchema.index({ college: 1 })
///*UserSchema.index({ email: 1 })*/

UserSchema.index({ following: 1 })
UserSchema.index({ followers: 1 })
UserSchema.index({ pendingRequests: 1 })
UserSchema.index({ createdAt: -1 })

module.exports = mongoose.model('User', UserSchema)