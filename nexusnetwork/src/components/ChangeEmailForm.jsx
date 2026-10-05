import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { changeEmail } from '../services/api'
import { markCodeSent } from '../utils/verifyState'

// New email + current password. On success the API ends other sessions and
// returns a fresh token for this one; a code is sent to the new address.
export default function ChangeEmailForm({ onDone, submitLabel = 'Change email' }) {
  const { login } = useAuth()
  const [email,   setEmail]   = useState('')
  const [pw,      setPw]      = useState('')
  const [err,     setErr]     = useState('')
  const [busy,    setBusy]    = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setErr('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setErr('Enter a valid email address')
    if (!pw) return setErr('Enter your current password')
    setBusy(true)
    try {
      const res = await changeEmail(email.trim().toLowerCase(), pw)
      login(res.data.user, res.data.token)
      markCodeSent()
      setEmail(''); setPw('')
      onDone?.(res.data)
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not change your email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <input className="ob-inp" type="email" autoComplete="email" placeholder="New email address"
        value={email} onChange={e => { setEmail(e.target.value); setErr('') }} />
      <input className="ob-inp" type="password" autoComplete="current-password" placeholder="Current password"
        value={pw} onChange={e => { setPw(e.target.value); setErr('') }} />
      {err && <div className="ob-err">{err}</div>}
      <button className="ob-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      <p className="ob-note">We'll send a code to the new address. This logs you out on your other devices.</p>
    </form>
  )
}
