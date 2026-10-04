const Report = require('../models/Report')

// Idempotent, run once per process start after MongoDB connects.
async function runStartupMigrations() {
  // Reports created before targetType existed are post reports
  const { modifiedCount } = await Report.updateMany(
    { targetType: { $exists: false } },
    { $set: { targetType: 'post' } }
  )
  if (modifiedCount) console.log(`✅ Migrated ${modifiedCount} reports to targetType=post`)

  // Replace the old { post, reportedBy } unique index with one_report_per_target
  const dropped = await Report.syncIndexes()
  if (dropped.length) console.log(`✅ Report indexes dropped: ${dropped.join(', ')}`)
}

module.exports = runStartupMigrations
