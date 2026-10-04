import { Link } from 'react-router-dom'
import { LEGAL_LAST_UPDATED } from '../config/legal'

// Plain page shell for legal / account pages (public, no bottom nav needed)
export default function DocPage({ title, updated = false, children }) {
  return (
    <div className="doc-page">
      <Link to="/" className="doc-back">← MeetNet</Link>
      <h1 className="doc-h1">{title}</h1>
      {updated && <div className="doc-meta">Last updated: {LEGAL_LAST_UPDATED}</div>}
      {children}
    </div>
  )
}
