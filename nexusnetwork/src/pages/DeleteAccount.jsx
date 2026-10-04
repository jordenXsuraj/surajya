import { useState } from 'react'
import { Link } from 'react-router-dom'
import DocPage from '../components/DocPage'
import { deleteMyAccount } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { SUPPORT_EMAIL } from '../config/legal'

// Public page (required by Google Play): explains deletion; logged-in users can delete here.
export default function DeleteAccount() {
  const { user, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [sure,     setSure]     = useState(false)
  const [err,      setErr]      = useState('')
  const [loading,  setLoading]  = useState(false)
  const [deleted,  setDeleted]  = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (loading) return
    setErr('')
    if (!password) return setErr('Enter your password')
    if (!sure)     return setErr('Please confirm that you understand this is permanent')
    setLoading(true)
    try {
      await deleteMyAccount(password)
      logout()
      setDeleted(true)
    } catch (e) {
      setErr(e.response?.data?.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Delete my MeetNet account')}` +
    `&body=${encodeURIComponent('Please delete my MeetNet account.\n\nThe email address I signed up with: \n')}`

  return (
    <DocPage title="Delete your MeetNet account">
      <p>You can permanently delete your account at any time, from the app (Profile → Delete account) or on this page.</p>

      <h2 className="doc-h2">What gets deleted</h2>
      <ul>
        <li>Your profile, email address, password and settings</li>
        <li>Every post you made (including anonymous posts), and their images and PDFs</li>
        <li>Your replies and likes on other people's posts</li>
        <li>Your follows, followers, follow requests and block list</li>
        <li>Your notifications and the reports you filed</li>
      </ul>
      <p>Deletion happens immediately and cannot be undone. Copies in encrypted backups held by our database provider are overwritten within their normal backup cycle. {/* TODO(owner): confirm the MongoDB Atlas backup retention for your plan and state it here */}</p>

      {deleted ? (
        <div className="doc-card">
          <div className="doc-ok">Your account has been deleted.</div>
          <p>Thanks for being part of MeetNet. <Link to="/">Back to the home page</Link></p>
        </div>
      ) : user ? (
        <form className="doc-card" onSubmit={submit}>
          <p style={{ marginTop: 0 }}>Logged in as <strong style={{ color: 'var(--text)' }}>{user.email || user.name}</strong>. Enter your password to delete this account.</p>
          <input className="ob-inp" type="password" autoComplete="current-password"
            placeholder="Your password" value={password}
            onChange={e => { setPassword(e.target.value); setErr('') }} />
          <label className="ob-check">
            <input type="checkbox" checked={sure} onChange={e => { setSure(e.target.checked); setErr('') }} />
            <span>I understand this permanently deletes my account and everything listed above.</span>
          </label>
          {err && <div className="ob-err">{err}</div>}
          <button className="ob-btn" type="submit" disabled={loading}>
            {loading ? 'Deleting…' : 'Delete my account permanently'}
          </button>
        </form>
      ) : (
        <div className="doc-card">
          <p style={{ marginTop: 0 }}><Link to="/">Log in</Link>, then come back to this page (or use Profile → Delete account).</p>
          {/* TODO(owner): confirm you can honour the 30-day manual deletion promise below */}
          <p style={{ marginBottom: 0 }}>Can't log in? <Link to="/forgot-password">Reset your password</Link>, or email <a href={mailto}>{SUPPORT_EMAIL}</a> from the address you signed up with and we'll delete the account within 30 days.</p>
        </div>
      )}
    </DocPage>
  )
}
