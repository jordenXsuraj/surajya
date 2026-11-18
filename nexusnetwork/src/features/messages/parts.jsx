import { createPortal } from 'react-dom'
import { REPORT_REASONS } from '../../lib/ui'

// Small building blocks for the direct-message pages

export function Avatar({ user, size = 44, online }) {
  const style = { width: size, height: size, fontSize: size * 0.34 }
  const initials = (user?.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="dm-avatar-wrap" style={{ width: size, height: size }}>
      {user?.avatar
        ? <img className="dm-avatar" src={user.avatar} alt="" loading="lazy" style={style} />
        : <div className="dm-avatar" style={style} aria-hidden="true">{initials}</div>}
      {online && <span className="dm-online" aria-label="Active now" />}
    </div>
  )
}

export function BackButton({ onClick }) {
  return (
    <button className="dm-back" onClick={onClick} aria-label="Back">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  )
}

// Bottom sheet with actions: items [{ label, onClick, danger }]
export function Sheet({ title, items, onClose }) {
  return createPortal(
    <div className="dm-overlay" role="dialog" aria-modal="true" aria-label={title || 'Actions'} onClick={onClose}>
      <div className="dm-sheet" onClick={e => e.stopPropagation()}>
        {title && <div className="dm-sheet-head">{title}</div>}
        {items.map(it => (
          <button key={it.label} className={it.danger ? 'danger' : ''} onClick={() => { onClose(); it.onClick() }}>{it.label}</button>
        ))}
        <button className="cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}

// The report reasons as a sheet
export function ReportSheet({ title = 'Why are you reporting?', onReport, onClose }) {
  return <Sheet title={title} onClose={onClose} items={REPORT_REASONS.map(([val, label]) => ({ label, onClick: () => onReport(val) }))} />
}

export function Confirm({ title, text, confirmLabel, danger, onConfirm, onCancel, busy }) {
  return createPortal(
    <div className="dm-overlay center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dm-dialog">
        <h3>{title}</h3>
        <p>{text}</p>
        <button className={`dm-btn${danger ? ' danger' : ''}`} style={{ height: 44 }} onClick={onConfirm} disabled={busy}>{busy ? 'Please wait…' : confirmLabel}</button>
        <button className="dm-btn ghost" style={{ height: 44 }} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>,
    document.body,
  )
}
