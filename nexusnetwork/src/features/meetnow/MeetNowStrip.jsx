import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRealtime } from '../../context/realtime'
import MeetNowCard from './MeetNowCard'
import { useMeetupList, useJoinAndOpen } from './hooks'
import { useNow } from './util'
import './meetnow.css'

// Compact MeetNow row at the top of Home. Renders nothing unless MeetNow is available to this account.
export default function MeetNowStrip({ onToast }) {
  const { features } = useRealtime()
  if (!features.meetnow) return null
  return <Strip onToast={onToast} />
}

function Strip({ onToast }) {
  const nav = useNavigate()
  const now = useNow()
  const { list, loading, error, setList } = useMeetupList({ limit: 12 })
  const { busyId, joinAndOpen } = useJoinAndOpen((msg, err, meetup) => {
    onToast?.(`⚠️ ${msg}`)
    if (err?.response?.data?.code === 'MEETUP_NOT_FOUND') setList(l => l.filter(m => m._id !== meetup._id))
  })
  const rowRef = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const updateEdges = () => {
    const el = rowRef.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 8, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 })
  }
  useEffect(updateEdges, [list.length, loading])
  const scroll = dir => rowRef.current?.scrollBy({ left: dir * 158 * 2, behavior: 'smooth' })

  return (
    <section className="mn-strip" aria-label="MeetNow">
      <div className="mn-strip-head">
        <span className="mn-live-dot" aria-hidden="true" />
        <span className="mn-strip-title">MeetNow</span>
        <span className="mn-strip-sub">Live groups · join &amp; chat</span>
        <button className="mn-view-all" onClick={() => nav('/meetnow')}>View all ›</button>
      </div>
      <div className="mn-row-wrap">
        <button className={`mn-arrow left${edges.left ? ' show' : ''}`} onClick={() => scroll(-1)} aria-label="Scroll left">‹</button>
        <div className="mn-row" ref={rowRef} onScroll={updateEdges}>
          <button className="mn-card create" onClick={() => nav('/meetnow/new')}>
            <span className="mn-plus" aria-hidden="true">+</span>
            <span className="mn-create-title">Start a MeetNow</span>
            <span className="mn-create-sub">
              {!loading && !error && list.length === 0 ? 'Nothing live right now. Be the first.' : 'A group for the next few hours'}
            </span>
          </button>
          {loading && [0, 1].map(i => <div key={i} className="mn-card skeleton" aria-hidden="true" />)}
          {!loading && list.map(m => (
            <MeetNowCard key={m._id} meetup={m} now={now} busy={busyId === m._id}
              onOpen={x => nav(`/meetnow/${x._id}`)} onJoin={joinAndOpen} />
          ))}
        </div>
        <button className={`mn-arrow right${edges.right ? ' show' : ''}`} onClick={() => scroll(1)} aria-label="Scroll right">›</button>
      </div>
      {error && !loading && <div className="mn-hint" style={{ padding: '6px 14px 0' }}>{error}</div>}
    </section>
  )
}
