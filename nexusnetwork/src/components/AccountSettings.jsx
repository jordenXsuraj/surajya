import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { changePassword, logoutAllDevices, updateProfile } from '../services/api'
import { useRealtime } from '../context/realtime'
import ChangeEmailForm from './ChangeEmailForm'
import '../features/messages/messages.css'

// Profile → Account: change password, log out everywhere, delete account.
// Both actions end every other session; the API returns a fresh token for this one.
export default function AccountSettings({ onMessage }) {
  const { user, login, updateUser } = useAuth()
  const { features } = useRealtime()
  const [statusBusy, setStatusBusy] = useState(false)
  const nav = useNavigate()
  const [open,    setOpen]    = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const [cur,     setCur]     = useState('')
  const [pw,      setPw]      = useState('')
  const [pw2,     setPw2]     = useState('')
  const [err,     setErr]     = useState('')
  const [busy,    setBusy]    = useState(false)
  const [outBusy, setOutBusy] = useState(false)

  function reset() { setCur(''); setPw(''); setPw2(''); setErr('') }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setErr('')
    if (!cur)          return setErr('Enter your current password')
    if (pw.length < 8) return setErr('New password must be at least 8 characters')
    if (pw !== pw2)    return setErr("New passwords don't match")
    setBusy(true)
    try {
      const res = await changePassword(cur, pw)
      login(user, res.data.token)
      reset(); setOpen(false)
      onMessage?.('✅ Password changed. Other devices were logged out.')
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not change password')
    } finally {
      setBusy(false)
    }
  }

  async function logoutEverywhere() {
    if (outBusy) return
    if (!window.confirm('Log out of MeetNet on every other device?')) return
    setOutBusy(true)
    try {
      const res = await logoutAllDevices()
      login(user, res.data.token)
      onMessage?.('✅ Logged out of all other devices')
    } catch (e) {
      onMessage?.(`❌ ${e.response?.data?.message || 'Something went wrong'}`)
    } finally {
      setOutBusy(false)
    }
  }

  // Direct messages: whether others see when you're active (and you see theirs)
  async function toggleActivity() {
    const next = user?.showActivityStatus === false
    setStatusBusy(true)
    try {
      await updateProfile({ showActivityStatus: next })
      updateUser({ showActivityStatus: next })
      onMessage?.(next ? 'Activity status is on' : 'Activity status is off')
    } catch {
      onMessage?.('⚠️ Could not change it. Try again.')
    } finally {
      setStatusBusy(false)
    }
  }

  return (
    <div className="acct-section">
      <div className="acct-title">Account</div>

      {features.dm && (
        <div className="acct-row" style={{ cursor: 'default' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
            <span>🟢 Show activity status</span>
            <span style={{ fontSize: '.66rem', color: 'var(--muted)', fontWeight: 400 }}>
              People you message see when you're active. Turn it off and you won't see theirs either.
            </span>
          </span>
          <button type="button" role="switch" aria-checked={user?.showActivityStatus !== false} aria-label="Show activity status"
            className={`dm-switch${user?.showActivityStatus !== false ? ' on' : ''}`} disabled={statusBusy} onClick={toggleActivity} />
        </div>
      )}

      <button className="acct-row" onClick={() => { setOpen(o => !o); reset() }}>
        <span>🔑 Change password</span><span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <form className="acct-form" onSubmit={submit}>
          <input className="ob-inp" type="password" autoComplete="current-password"
            placeholder="Current password" value={cur} onChange={e => { setCur(e.target.value); setErr('') }} />
          <input className="ob-inp" type="password" autoComplete="new-password"
            placeholder="New password (min 8)" value={pw} onChange={e => { setPw(e.target.value); setErr('') }} />
          <input className="ob-inp" type="password" autoComplete="new-password"
            placeholder="Repeat new password" value={pw2} onChange={e => { setPw2(e.target.value); setErr('') }} />
          {err && <div className="ob-err">{err}</div>}
          <button className="ob-btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
          <Link to="/forgot-password" className="ob-link" style={{ textAlign: 'center', margin: 0 }}>Forgot your current password?</Link>
        </form>
      )}

      <button className="acct-row" onClick={() => setEmailOpen(o => !o)}>
        <span>
          ✉️ Change email
          <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--muted)', marginTop: 2 }}>
            {user?.email}{user?.emailVerified ? ' · verified' : ' · not verified'}
          </span>
        </span>
        <span>{emailOpen ? '▲' : '▼'}</span>
      </button>
      {emailOpen && (
        <div className="acct-form">
          <ChangeEmailForm onDone={() => { setEmailOpen(false); nav('/verify-email') }} />
        </div>
      )}
      {!user?.emailVerified && !emailOpen && (
        <Link to="/verify-email" className="acct-row"><span>✅ Verify email</span><span>›</span></Link>
      )}

      <button className="acct-row" onClick={logoutEverywhere} disabled={outBusy}>
        <span>📱 Log out of all devices</span><span>{outBusy ? '…' : ''}</span>
      </button>
      <Link to="/delete-account" className="acct-row danger">
        <span>🗑️ Delete account</span><span>›</span>
      </Link>
    </div>
  )
}
