import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Toast from '../../components/Toast'
import { useToast } from '../../hooks/useToast'
import MeetNowCard from './MeetNowCard'
import { CATEGORIES } from './meta'
import { useMeetupList, useJoinAndOpen } from './hooks'
import { BackButton } from './parts'
import { useNow } from './util'
import './meetnow.css'

// /meetnow — every active MeetNow this user can see, filterable by category
export default function MeetNowAll() {
  const nav = useNavigate()
  const now = useNow()
  const { msg, show, clear } = useToast()
  const [category, setCategory] = useState('')
  const { list, loading, error, reload, setList } = useMeetupList({ category: category || undefined, limit: 50 })
  const { busyId, joinAndOpen } = useJoinAndOpen((text, err, meetup) => {
    show(`⚠️ ${text}`)
    if (err?.response?.data?.code === 'MEETUP_NOT_FOUND') setList(l => l.filter(m => m._id !== meetup._id))
  })

  return (
    <div className="page-wrap mn-page">
      <div className="mn-topbar">
        <BackButton onClick={() => nav(-1)} />
        <div className="mn-topbar-title">MeetNow <div className="mn-topbar-sub">Live groups · gone when they end</div></div>
        <button className="mn-btn" style={{ width: 'auto', padding: '0 14px', height: 34 }} onClick={() => nav('/meetnow/new')}>+ Start</button>
      </div>

      <div className="mn-section" style={{ paddingBottom: 8 }}>
        <div className="mn-chips" role="group" aria-label="Category">
          <button className={`mn-chip${!category ? ' on' : ''}`} onClick={() => setCategory('')}>All</button>
          {CATEGORIES.map(c => (
            <button key={c.id} className={`mn-chip${category === c.id ? ' on' : ''}`} onClick={() => setCategory(category === c.id ? '' : c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="mn-list">{[0, 1, 2].map(i => <div key={i} className="mn-card skeleton" style={{ height: 76 }} aria-hidden="true" />)}</div>}

      {!loading && error && (
        <div className="mn-empty">
          <div className="mn-empty-icon">📡</div>
          {error}
          <div style={{ marginTop: 12 }}><button className="mn-btn ghost" style={{ width: 'auto', padding: '0 18px' }} onClick={reload}>Try again</button></div>
        </div>
      )}

      {!loading && !error && list.length === 0 && (
        <div className="mn-empty">
          <div className="mn-empty-icon">🌙</div>
          No MeetNows {category ? 'in this category ' : ''}right now.
          <div style={{ marginTop: 12 }}><button className="mn-btn" style={{ width: 'auto', padding: '0 18px' }} onClick={() => nav('/meetnow/new')}>Start one</button></div>
        </div>
      )}

      {!loading && !error && list.length > 0 && (
        <div className="mn-list">
          {list.map(m => (
            <MeetNowCard key={m._id} wide meetup={m} now={now} busy={busyId === m._id}
              onOpen={x => nav(`/meetnow/${x._id}`)} onJoin={joinAndOpen} />
          ))}
        </div>
      )}
      <Toast msg={msg} onClose={clear} />
    </div>
  )
}
