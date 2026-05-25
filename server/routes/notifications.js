
const express      = require('express')
const router       = express.Router()
const Notification = require('../models/Notification')
const protect      = require('../middleware/auth')

// ─────────────────────────────────────────────
// GET /api/notifications
// Get all my notifications (newest first)
// ─────────────────────────────────────────────

router.get('/', protect, async (req, res) => {
  try {
      const page  = Math.max(1, parseInt(req.query.page) || 1)
 const limit = Math.min(50, parseInt(req.query.limit) || 25)
  const skip  = (page - 1) * limit

  const notifications = await Notification.find({ recipient: req.user._id })
    .populate('sender', 'name year branch college avatar')
    .populate('post',   'type text')
    .sort({ read: 1, createdAt: -1 })
    .skip(skip)
    .limit(limit).lean()

  res.json(notifications)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})



// ─────────────────────────────────────────────
// GET /api/notifications/unread-count
// Get count of unread notifications (for badge)
// ─────────────────────────────────────────────
router.get('/unread-count', protect, async (req, res) => {
  const count = await Notification.countDocuments({
    recipient: req.user._id,
    read: false
  })
  res.json({ count })
})

// ─────────────────────────────────────────────
// PUT /api/notifications/mark-read
// Mark all notifications as read
// ─────────────────────────────────────────────
router.put('/mark-read', protect, async (req, res) => {
  await Notification.updateMany(
    { recipient: req.user._id, read: false },
    { $set: { read: true } }
  )
  res.json({ success: true })
})

// ─────────────────────────────────────────────
// PUT /api/notifications/:id/read
// Mark a single notification as read
// ─────────────────────────────────────────────
router.put('/:id/read', protect, async (req, res) => {
  await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { $set: { read: true } }
  )
  res.json({ message: 'Notification read' })
})

module.exports = router