const mongoose = require('mongoose')

// One-time password reset tokens. Only the SHA-256 of the token is stored;
// the raw token exists only in the emailed link.
const PasswordResetSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  used:      { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
})

// MongoDB removes expired tokens automatically (checks run about once a minute,
// so routes must still compare expiresAt themselves)
PasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

module.exports = mongoose.model('PasswordReset', PasswordResetSchema)
