import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EMAIL_NOT_VERIFIED_EVENT } from '../services/api'

// Shown whenever the API refuses an action with EMAIL_NOT_VERIFIED (see services/api.js)
export default function EmailNotVerifiedToast() {
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let timer
    const onEvent = e => {
      setMsg(e.detail?.message || 'Please verify your email address first.')
      clearTimeout(timer)
      timer = setTimeout(() => setMsg(''), 6000)
    }
    window.addEventListener(EMAIL_NOT_VERIFIED_EVENT, onEvent)
    return () => { window.removeEventListener(EMAIL_NOT_VERIFIED_EVENT, onEvent); clearTimeout(timer) }
  }, [])

  if (!msg) return null
  return (
    <div className="toast-msg verify-toast" role="alert" aria-live="polite">
      <span>{msg}</span>{' '}
      <Link to="/verify-email" onClick={() => setMsg('')}>Verify now →</Link>
    </div>
  )
}
