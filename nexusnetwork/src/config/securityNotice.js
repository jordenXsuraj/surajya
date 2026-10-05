// Security notice about the data exposure fixed on 2026-10-04 (see docs/DEPLOYMENT.md, History).
// Same wording as the email sent by server/scripts/sendSecurityNotice.js — keep them in sync.
export const SECURITY_NOTICE_ID = 'security-notice-2026-10'

export const SECURITY_NOTICE_TEXT =
  'Security notice: between 11 June and 4 October 2026, a bug let anyone who opened a post\'s link see ' +
  'the post author\'s email address and password hash (bcrypt — never the actual password), and who wrote ' +
  'anonymous posts. If you never published a post, your password hash was not exposed. Separately, from May ' +
  'until 4 October, any logged-in member could look up other members\' email addresses. Both problems are fixed. ' +
  'We found no sign of misuse in the server logs we still have, which cover only the final week before the fix. ' +
  'We signed everyone out as a precaution. If you used your MeetNet password on any other site, change it there. ' +
  'You can change your MeetNet password in Profile → Account, or use Forgot password.'

// Shown up to and including 5 November 2026 (India time), then never again
export const SECURITY_NOTICE_UNTIL = Date.parse('2026-11-06T00:00:00+05:30')
