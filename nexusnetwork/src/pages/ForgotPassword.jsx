import { useState } from 'react'
import { Link } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { forgotPassword } from '../services/api'

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (loading) return
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setErr('Enter a valid email')
    setLoading(true)
    try {
      const res = await forgotPassword(email.trim().toLowerCase())
      setSent(res.data.message)
    } catch (e) {
      setErr(e.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <DocPage title="Forgot password">
      <p>Enter the email you signed up with. If an account exists, we'll email you a link to choose a new password. The link works once and expires in 30 minutes.</p>
      <form className="doc-card" onSubmit={submit}>
        {sent ? (
          <>
            <div className="doc-ok">{sent}</div>
            <p>Didn't get it? Check your spam folder, or try again in a few minutes.</p>
          </>
        ) : (
          <>
            <input className="ob-inp" type="email" autoComplete="email" autoFocus
              placeholder="Your email" value={email}
              onChange={e => { setEmail(e.target.value); setErr('') }} />
            {err && <div className="ob-err">{err}</div>}
            <button className="ob-btn" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
      </form>
      <p><Link to="/">Back to log in</Link></p>
    </DocPage>
  )
}
