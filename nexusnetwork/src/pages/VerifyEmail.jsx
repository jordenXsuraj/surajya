import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import DocPage from '../components/DocPage'
import ChangeEmailForm from '../components/ChangeEmailForm'
import { useAuth } from '../context/AuthContext'
import { sendVerificationCode, verifyEmailCode } from '../services/api'
import { markCodeSent, secondsUntilResend, RESEND_SECONDS } from '../utils/verifyState'

const EMPTY = ['', '', '', '', '', '']

export default function VerifyEmail() {
  const { user, updateUser } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()

  const [digits,   setDigits]   = useState(EMPTY)
  const [err,      setErr]      = useState('')
  const [info,     setInfo]     = useState('')
  const [busy,     setBusy]     = useState(false)
  const [left,     setLeft]     = useState(secondsUntilResend)
  const [changing, setChanging] = useState(params.get('change') === '1')
  const [done,     setDone]     = useState(false)
  const boxes = useRef([])

  // Resend countdown
  useEffect(() => {
    const t = setInterval(() => setLeft(secondsUntilResend()), 1000)
    return () => clearInterval(t)
  }, [])

  async function submit(code) {
    if (busy || code.length !== 6) return
    setBusy(true); setErr(''); setInfo('')
    try {
      const res = await verifyEmailCode(code)
      updateUser(res.data.user)
      setDone(true)
    } catch (e) {
      const d = e.response?.data
      setErr(d?.message || 'Could not verify. Please try again.')
      if (d?.code === 'CODE_LOCKED' || d?.code === 'CODE_EXPIRED') setDigits(EMPTY)
      boxes.current[0]?.focus()
    } finally {
      setBusy(false)
    }
  }

  function fill(fromIndex, text) {
    const incoming = text.replace(/\D/g, '').slice(0, 6 - fromIndex).split('')
    if (!incoming.length) return
    const next = [...digits]
    incoming.forEach((d, k) => { next[fromIndex + k] = d })
    setDigits(next); setErr('')
    const end = Math.min(fromIndex + incoming.length, 5)
    boxes.current[end]?.focus()
    if (next.every(Boolean)) submit(next.join(''))
  }

  function onKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      const next = [...digits]; next[i - 1] = ''; setDigits(next)
      boxes.current[i - 1]?.focus()
      e.preventDefault()
    } else if (e.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus()
    else if (e.key === 'ArrowRight' && i < 5) boxes.current[i + 1]?.focus()
  }

  async function resend() {
    if (left > 0 || busy) return
    setErr(''); setInfo('')
    try {
      const res = await sendVerificationCode()
      markCodeSent()
      setLeft(RESEND_SECONDS)
      setDigits(EMPTY)
      setInfo(res.data.message || 'We sent a new code.')
    } catch (e) {
      const d = e.response?.data
      if (d?.code === 'ALREADY_VERIFIED') { updateUser({ emailVerified: true, verificationRequired: false }); setDone(true); return }
      if (d?.retryAfterSeconds) setLeft(d.retryAfterSeconds)
      setErr(d?.message || 'Could not send a new code.')
    }
  }

  if (done || (user?.emailVerified && !user?.emailBounced && !changing)) {
    return (
      <DocPage title="Email verified">
        <div className="doc-card">
          <div className="doc-ok">✅ {user?.email} is verified. You can now post, reply and follow people, and reset your password by email if you ever need to.</div>
          <button className="ob-btn" onClick={() => nav('/home')}>Continue to MeetNet →</button>
        </div>
      </DocPage>
    )
  }

  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`

  return (
    <DocPage title="Verify your email">
      <p>We sent a 6-digit code to <strong style={{ color: 'var(--text)' }}>{user?.email}</strong>. It expires in 10 minutes.</p>

      {!changing && (
        <div className="doc-card">
          <div className="code-boxes" onPaste={e => { e.preventDefault(); fill(0, e.clipboardData.getData('text')) }}>
            {digits.map((d, i) => (
              <input key={i} ref={el => { boxes.current[i] = el }}
                className="code-box" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={6} value={d} autoFocus={i === 0} aria-label={`Digit ${i + 1}`}
                onChange={e => {
                  const v = e.target.value
                  // Typing over a filled box replaces it; a longer value is a pasted/autofilled code
                  fill(i, digits[i] && v.length === 2 ? v.slice(-1) : v)
                }}
                onKeyDown={e => onKeyDown(i, e)} />
            ))}
          </div>
          {err  && <div className="ob-err">{err}</div>}
          {info && <div className="doc-ok">{info}</div>}
          <button className="ob-btn" onClick={() => submit(digits.join(''))} disabled={busy || digits.some(x => !x)}>
            {busy ? 'Checking…' : 'Verify'}
          </button>
          <button className="ob-link" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', cursor: left > 0 ? 'default' : 'pointer' }}
            onClick={resend} disabled={left > 0}>
            {left > 0 ? `Resend code in ${mm}` : 'Resend code'}
          </button>
          <p className="ob-note">Can't find it? Check your spam folder.</p>
        </div>
      )}

      <div className="doc-card">
        {changing ? (
          <>
            <h2 className="doc-h2" style={{ marginTop: 0 }}>Change your email</h2>
            <ChangeEmailForm submitLabel="Change email and send code"
              onDone={() => { setChanging(false); setDigits(EMPTY); setLeft(RESEND_SECONDS); setErr(''); setInfo('We sent a code to your new address.') }} />
            <button className="ob-link" style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center' }}
              onClick={() => setChanging(false)}>Cancel</button>
          </>
        ) : (
          <p style={{ margin: 0 }}>Wrong email? <a href="#change" onClick={e => { e.preventDefault(); setChanging(true) }}>Change it</a></p>
        )}
      </div>

      <p>
        <Link to="/home">Skip for now</Link>
        {user?.verificationRequired
          ? " — you can browse, but you'll need to verify before posting, replying or following."
          : ' — verifying lets you reset your password by email.'}
      </p>
    </DocPage>
  )
}
