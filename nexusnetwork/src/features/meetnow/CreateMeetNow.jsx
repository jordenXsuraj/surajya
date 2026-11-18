import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMeetup, reportEmailNotVerified } from '../../services/api'
import { AUDIENCES, CATEGORIES, DEFAULT_DURATION, DURATIONS, durationRequest, formatEnd, previewEnd } from './meta'
import { BackButton } from './parts'
import { errorText, useNow } from './util'
import './meetnow.css'

// datetime-local value for a Date (local time, minutes)
const pad = n => String(n).padStart(2, '0')
const localValue = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

// /meetnow/new — the "Create MeetNow" form
export default function CreateMeetNow() {
  const nav = useNavigate()
  const now = useNow(15000)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [category, setCategory] = useState('event')
  const [location, setLocation] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION)
  const [customEnd, setCustomEnd] = useState(() => localValue(new Date(Date.now() + 2 * 3600e3)))
  const [visibility, setVisibility] = useState('college')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const customDate = useMemo(() => new Date(customEnd), [customEnd])
  const end = previewEnd(duration, customDate, now)
  const durationError = duration === 'custom' ? durationRequest('custom', customDate, now).error : null
  const canSubmit = title.trim().length >= 3 && location.trim().length >= 2 && !durationError && !busy

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    const d = durationRequest(duration, customDate, new Date())
    if (d.error) { setError(d.error); return }
    setBusy(true); setError('')
    try {
      const { data } = await createMeetup({ title: title.trim(), description: description.trim(), category, location: location.trim(), visibility, ...d })
      nav(`/meetnow/${data._id}/chat`, { replace: true })
    } catch (err) {
      if (!reportEmailNotVerified(err.response?.status, err.response?.data)) setError(errorText(err, 'Could not start it.'))
      setBusy(false)
    }
  }

  return (
    <form className="page-wrap mn-page" onSubmit={submit} noValidate>
      <div className="mn-topbar">
        <BackButton onClick={() => nav(-1)} />
        <div className="mn-topbar-title">Create MeetNow<span className="beta-badge">Beta</span></div>
      </div>
      <p className="mn-hint" style={{ padding: '10px 14px 0' }}>Beta — the app may take a few seconds to wake up.</p>

      <div className="mn-section">
        <label className="mn-label" htmlFor="mn-title">What's happening?</label>
        <input id="mn-title" className="mn-input" placeholder="e.g. Sinhgad Fest discussion" maxLength={80}
          value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        <div className="mn-counter">{title.length}/80</div>
        {showDetails ? (
          <>
            <textarea className="mn-textarea" placeholder="Details (optional): what to bring, who it's for…" maxLength={300}
              value={description} onChange={e => setDescription(e.target.value)} aria-label="Details" />
            <div className="mn-counter">{description.length}/300</div>
          </>
        ) : (
          <button type="button" className="mn-view-all" style={{ marginLeft: 0 }} onClick={() => setShowDetails(true)}>+ Add details</button>
        )}
      </div>

      <div className="mn-section" style={{ paddingTop: 0 }}>
        <span className="mn-label" id="mn-cat-label">Category</span>
        <div className="mn-cats" role="radiogroup" aria-labelledby="mn-cat-label">
          {CATEGORIES.map(c => (
            <button type="button" key={c.id} role="radio" aria-checked={category === c.id}
              className={`mn-cat${category === c.id ? ' on' : ''}`} onClick={() => setCategory(c.id)}>
              <span className="mn-cat-icon" aria-hidden="true">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mn-section" style={{ paddingTop: 0 }}>
        <label className="mn-label" htmlFor="mn-where">Where?</label>
        <div className="mn-input-wrap">
          <input id="mn-where" className="mn-input" placeholder="e.g. Sinhgad College, canteen" maxLength={80}
            value={location} onChange={e => setLocation(e.target.value)} />
          <span className="mn-input-icon" aria-hidden="true">📍</span>
        </div>
        <div className="mn-hint" style={{ marginTop: 6 }}>A place name only. MeetNow never shares anyone's live location.</div>
      </div>

      <div className="mn-section" style={{ paddingTop: 0 }}>
        <span className="mn-label" id="mn-dur-label">How long?</span>
        <div className="mn-chips" role="radiogroup" aria-labelledby="mn-dur-label">
          {DURATIONS.map(d => (
            <button type="button" key={d.id} role="radio" aria-checked={duration === d.id}
              className={`mn-chip${duration === d.id ? ' on' : ''}`} onClick={() => setDuration(d.id)}>
              {d.label}
            </button>
          ))}
        </div>
        {duration === 'custom' && (
          <input type="datetime-local" className="mn-input" style={{ marginTop: 10, colorScheme: 'dark' }} aria-label="Ends at"
            value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            min={localValue(new Date(now.getTime() + 15 * 60000))} max={localValue(new Date(now.getTime() + 72 * 3600e3))} />
        )}
        <div className="mn-endline" aria-live="polite">
          <span aria-hidden="true">⏱</span>
          {durationError ? <span className="mn-error" style={{ margin: 0 }}>{durationError}</span>
            : duration === 'leave'
              ? <span>Ends when you leave, at the latest <strong>{formatEnd(end, now)}</strong></span>
              : <span>Ends <strong>{end ? formatEnd(end, now) : '…'}</strong>, then it's deleted with its chat</span>}
        </div>
      </div>

      <div className="mn-section" style={{ paddingTop: 0 }}>
        <span className="mn-label" id="mn-aud-label">Who can join?</span>
        <div className="mn-chips" role="radiogroup" aria-labelledby="mn-aud-label">
          {AUDIENCES.map(a => (
            <button type="button" key={a.id} role="radio" aria-checked={visibility === a.id}
              className={`mn-chip${visibility === a.id ? ' on' : ''}`} onClick={() => setVisibility(a.id)}>
              {a.icon} {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mn-section" style={{ paddingTop: 4 }}>
        {error && <div className="mn-error" role="alert" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="submit" className="mn-btn big" disabled={!canSubmit}>{busy ? 'Starting…' : 'START MEETNOW'}</button>
      </div>
      <p className="mn-safety">Meet in public places. MeetNow and its chat are deleted for everyone when it ends; you can end it any time.</p>
    </form>
  )
}
