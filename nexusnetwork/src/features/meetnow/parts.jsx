import { useState, useEffect, useRef } from 'react'
import { categoryOf, timeLeft } from './meta'
import { REPORT_REASONS } from './util'

// Small shared pieces for the MeetNow pages

export function CategoryIcon({ category, size }) {
  const c = categoryOf(category)
  return (
    <div className="mn-icon" style={{ background: `${c.color}22`, ...(size && { width: size, height: size }) }} aria-hidden="true">
      {c.icon}
    </div>
  )
}

export function Avatar({ user, small }) {
  const cls = `mn-avatar${small ? ' sm' : ''}`
  if (user?.avatar) return <img className={cls} src={user.avatar} alt="" loading="lazy" />
  const initials = (user?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return <div className={cls} aria-hidden="true">{initials}</div>
}

export function TimeLeft({ expiresAt, now }) {
  const label = timeLeft(expiresAt, now)
  const soon = new Date(expiresAt) - now < 30 * 60000
  return <span className={`mn-left${soon ? ' soon' : ''}`}>{label || 'Ended'}</span>
}

export function BackButton({ onClick }) {
  return (
    <button className="mn-back" onClick={onClick} aria-label="Back">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  )
}

// A ⋯ button with a small menu; items: [{ label, onClick, danger }] or a report submenu
export function Menu({ items, label = 'More options' }) {
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(null)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = e => { if (!ref.current?.contains(e.target)) { setOpen(false); setReporting(null) } }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  return (
    <div className="mn-menu-wrap" ref={ref}>
      <button className="mn-back" aria-label={label} aria-expanded={open} onClick={() => { setOpen(o => !o); setReporting(null) }}>⋯</button>
      {open && (
        <div className="mn-menu" role="menu">
          {reporting ? (
            <>
              <div className="mn-menu-head">Why are you reporting?</div>
              {REPORT_REASONS.map(([val, text]) => (
                <button key={val} role="menuitem" onClick={() => { setOpen(false); setReporting(null); reporting(val) }}>{text}</button>
              ))}
            </>
          ) : items.map(it => (
            <button key={it.label} role="menuitem" className={it.danger ? 'danger' : ''}
              onClick={() => { if (it.report) { setReporting(() => it.report); return } setOpen(false); it.onClick() }}>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Confirm({ title, text, confirmLabel, onConfirm, onCancel, busy }) {
  return (
    <div className="mn-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mn-dialog">
        <h3>{title}</h3>
        <p>{text}</p>
        <button className="mn-btn big" onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
        <button className="mn-btn big quiet" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  )
}
