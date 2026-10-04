import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { resetPassword } from '../services/api'
import { useAuth } from '../context/AuthContext'

export default function ResetPassword() {
  const [params]  = useSearchParams()
  const token     = params.get('token') || ''
  const { user, logout } = useAuth()

  const [pw,      setPw]      = useState('')
  const [pw2,     setPw2]     = useState('')
  const [done,    setDone]    = useState('')
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (loading) return
    setErr('')
    if (pw.length < 8) return setErr('Password must be at least 8 characters')
    if (pw !== pw2)    return setErr("Passwords don't match")
    setLoading(true)
    try {
      const res = await resetPassword(token, pw)
      if (user) logout()            // every session was ended by the reset
      setDone(res.data.message)
    } catch (e) {
      setErr(e.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <DocPage title="Reset password">
        <div className="ob-err">This link is missing its reset token. Open the link from your email again, or request a new one.</div>
        <p><Link to="/forgot-password">Request a new link</Link></p>
      </DocPage>
    )
  }

  return (
    <DocPage title="Choose a new password">
      <form className="doc-card" onSubmit={submit}>
        {done ? (
          <>
            <div className="doc-ok">{done}</div>
            <Link to="/" className="ob-btn" style={{ display:'flex', alignItems:'center', justifyContent:'center', textDecoration:'none' }}>
              Log in →
            </Link>
          </>
        ) : (
          <>
            <input className="ob-inp" type="password" autoComplete="new-password" autoFocus
              placeholder="New password (min 8)" value={pw}
              onChange={e => { setPw(e.target.value); setErr('') }} />
            <input className="ob-inp" type="password" autoComplete="new-password"
              placeholder="Repeat new password" value={pw2}
              onChange={e => { setPw2(e.target.value); setErr('') }} />
            {err && (
              <div className="ob-err">
                {err}{' '}
                {/expired|invalid/i.test(err) && <Link to="/forgot-password">Request a new link</Link>}
              </div>
            )}
            <button className="ob-btn" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Set new password'}
            </button>
            <p className="ob-note">This logs you out on every device.</p>
          </>
        )}
      </form>
    </DocPage>
  )
}
