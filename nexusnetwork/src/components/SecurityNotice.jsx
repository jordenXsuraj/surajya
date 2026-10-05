import { useState } from 'react'
import { SECURITY_NOTICE_ID, SECURITY_NOTICE_TEXT, SECURITY_NOTICE_UNTIL } from '../config/securityNotice'

const KEY = `nx_dismissed_${SECURITY_NOTICE_ID}`

function isDismissed() {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

// Dismissible bar for logged-in users; stops showing after SECURITY_NOTICE_UNTIL.
export default function SecurityNotice() {
  const [hidden, setHidden] = useState(() => Date.now() >= SECURITY_NOTICE_UNTIL || isDismissed())
  if (hidden) return null

  function dismiss() {
    try { localStorage.setItem(KEY, '1') } catch { /* private mode: hide for this visit only */ }
    setHidden(true)
  }

  return (
    <div className="sec-notice" role="region" aria-label="Security notice">
      <p className="sec-notice-text">🔒 {SECURITY_NOTICE_TEXT}</p>
      <button className="sec-notice-close" onClick={dismiss} aria-label="Dismiss security notice">✕</button>
    </div>
  )
}
