import { categoryOf } from './meta'
import { CategoryIcon, TimeLeft } from './parts'

// One MeetNow. Clicking the card opens the details; the button joins (or opens the chat).
export default function MeetNowCard({ meetup, now, busy, onOpen, onJoin, wide }) {
  const c = categoryOf(meetup.category)
  const action = meetup.joined ? 'OPEN CHAT' : 'JOIN'
  const button = (
    <button className={`mn-btn${meetup.joined ? ' ghost' : ''}`} disabled={busy}
      onClick={e => { e.stopPropagation(); onJoin(meetup) }}
      aria-label={`${meetup.joined ? 'Open chat of' : 'Join'} ${meetup.title}`}>
      {busy ? '…' : action}
    </button>
  )
  return (
    <div className={`mn-card${meetup.joined ? ' joined' : ''}`} role="button" tabIndex={0}
      onClick={() => onOpen(meetup)} onKeyDown={e => { if (e.key === 'Enter') onOpen(meetup) }}
      aria-label={`${meetup.title}, ${c.label}, ${meetup.memberCount} joined`}>
      {wide ? (
        <>
          <CategoryIcon category={meetup.category} />
          <div className="mn-card-body">
            <div className="mn-card-title" style={{ minHeight: 0 }}>{meetup.title}</div>
            <div className="mn-card-meta"><span>📍 {meetup.location}</span></div>
            <div className="mn-card-meta">
              <span className="mn-card-count">👥 {meetup.memberCount} joined</span>
              <span>·</span>
              <TimeLeft expiresAt={meetup.expiresAt} now={now} />
            </div>
          </div>
          {button}
        </>
      ) : (
        <>
          <div className="mn-card-top">
            <CategoryIcon category={meetup.category} />
            <TimeLeft expiresAt={meetup.expiresAt} now={now} />
          </div>
          <div className="mn-card-title" title={meetup.title}>{meetup.title}</div>
          {/* place and people on one line: "MIT-WPU · 12 joined" */}
          <div className="mn-card-meta mn-card-line">
            <span className="mn-card-place">{meetup.location}</span>
            <span aria-hidden="true">·</span>
            <span className="mn-card-count">{meetup.memberCount} joined</span>
          </div>
          {button}
        </>
      )}
    </div>
  )
}
