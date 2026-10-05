const mongoose = require('mongoose')

// One active 6-digit email verification code per user. Only an HMAC-SHA256 of
// the code is stored; the code itself exists only in the email.
const EmailVerificationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email:     { type: String, required: true },          // the address the code was sent to
  codeHash:  { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts:  { type: Number, default: 0 },               // wrong guesses; the code dies at 5
  createdAt: { type: Date, default: Date.now },
})

// MongoDB deletes expired codes automatically (about once a minute — routes still
// check expiresAt themselves)
EmailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('EmailVerification', EmailVerificationSchema)
