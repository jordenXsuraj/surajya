import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const KEY = 'nx_verify_banner_dismissed'
const dismissed = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

// Soft reminder for logged-in users whose email isn't verified (or bounced).
// Dismissing hides it for this browser session only.
export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [hidden, setHidden] = useState(dismissed)

  if (!user || hidden || pathname === '/verify-email') return null
  if (user.emailVerified && !user.emailBounced) return null

  function dismiss() {
    try { sessionStorage.setItem(KEY, '1') } catch { /* private mode */ }
    setHidden(true)
  }

  return (
    <div className="sec-notice verify-banner" role="region" aria-label="Email verification">
      <p className="sec-notice-text">
        {user.emailBounced
          ? <>📭 Your email bounced — please update it. <Link to="/verify-email?change=1">Update email →</Link></>
          : <>✉️ Verify your email so you can reset your password. <Link to="/verify-email">Verify now →</Link></>}
      </p>
      <button className="sec-notice-close" onClick={dismiss} aria-label="Dismiss for this session">✕</button>
    </div>
  )
}
