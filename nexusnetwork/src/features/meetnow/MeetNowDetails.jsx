import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Toast from '../../components/Toast'
import { useToast } from '../../hooks/useToast'
import { useRealtime } from '../../context/realtime'
import { endMeetup, getMeetup, joinMeetup, leaveMeetup, reportMeetup, reportEmailNotVerified } from '../../services/api'
import { request } from '../../lib/socket'
import { categoryOf, formatEnd, timeLeft } from './meta'
import { Avatar, BackButton, Confirm, Menu } from './parts'
import { errorText, useNow } from './util'
import './meetnow.css'

// /meetnow/:id — what, where, who, how long; join or open the chat
export default function MeetNowDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const now = useNow()
  const { socket, connected } = useRealtime()
  const { msg, show, clear } = useToast()
  const [meetup, setMeetup] = useState(null)
  const [state, setState] = useState('loading')   // loading | ready | gone | error
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(null)
  const reloadTimer = useRef(null)

  const load = useCallback(() => getMeetup(id)
    .then(r => { setMeetup(r.data); setState('ready') })
    .catch(err => setState(err.response?.status === 404 ? 'gone' : 'error')), [id])
  useEffect(() => { load() }, [load])

  // Live: member changes reload the list, the end closes the page
  useEffect(() => {
    if (!socket || !connected) return
    request(socket, 'meetnow:watch')
    const onMembers = p => {
      if (p.meetupId !== id) return
      setMeetup(m => (m ? { ...m, memberCount: p.memberCount } : m))
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(load, 600)
    }
    const onEnded = p => { if (p.meetupId === id) setState('gone') }
    socket.on('meetup:members', onMembers)
    socket.on('meetup:ended', onEnded)
    return () => { socket.off('meetup:members', onMembers); socket.off('meetup:ended', onEnded); clearTimeout(reloadTimer.current) }
  }, [socket, connected, id, load])

  // Its time ran out while the page is open
  async function join() {
    setBusy(true)
    try {
      await joinMeetup(id)
      nav(`/meetnow/${id}/chat`)
    } catch (err) {
      if (err.response?.status === 404) setState('gone')
      else if (!reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err, 'Could not join.')}`)
    } finally { setBusy(false) }
  }

  async function runConfirmed(action) {
    setBusy(true)
    try {
      if (action === 'end') { await endMeetup(id); nav('/home', { replace: true }); return }
      const { data } = await leaveMeetup(id)
      if (data.ended) { nav('/home', { replace: true }); return }
      setConfirm(null); show('You left this MeetNow'); load()
    } catch (err) {
      if (err.response?.status === 404) setState('gone')
      else show(`⚠️ ${errorText(err)}`)
    } finally { setBusy(false) }
  }

  async function report(reason) {
    try { await reportMeetup(id, reason); show('✅ Report submitted. Thank you.') }
    catch (err) { if (!reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err)}`) }
  }

  if (state === 'loading') return <div className="page-wrap mn-page"><div className="feed-loading">Loading…</div></div>
  // its time ran out while the page is open (the server refuses it from that second on)
  const expired = Boolean(meetup) && new Date(meetup.expiresAt) <= now
  if (state !== 'ready' || expired) return <Ended error={state === 'error'} onRetry={load} onHome={() => nav('/home', { replace: true })} />

  const c = categoryOf(meetup.category)
  const left = timeLeft(meetup.expiresAt, now)
  const soon = new Date(meetup.expiresAt) - now < 30 * 60000
  const menu = [
    ...(meetup.joined && !meetup.isCreator ? [{ label: '🚪 Leave MeetNow', onClick: () => setConfirm('leave') }] : []),
    ...(meetup.isCreator ? [
      { label: '🚪 Leave (it keeps running)', onClick: () => setConfirm('leave') },
      { label: '⛔ End MeetNow for everyone', onClick: () => setConfirm('end'), danger: true },
    ] : [{ label: '🚩 Report MeetNow', report }]),
  ]
  const shown = meetup.members.slice(0, 5)

  return (
    <div className="page-wrap mn-page" style={{ paddingBottom: 'calc(var(--nav) + 80px)' }}>
      <div className="mn-topbar">
        <BackButton onClick={() => nav(-1)} />
        <div className="mn-topbar-title">MeetNow</div>
        <Menu items={menu} />
      </div>

      <div className="mn-hero">
        <span className="mn-hero-cat" style={{ background: `${c.color}22`, color: c.color }}>{c.icon} {c.label}</span>
        <h1 className="mn-hero-title">{meetup.title}</h1>
        {meetup.description && <p className="mn-hero-desc">{meetup.description}</p>}
        <div className="mn-stack" aria-hidden="true" style={{ marginTop: 2 }}>
          {shown.map(m => <Avatar key={m._id} user={m} small />)}
        </div>
      </div>

      <div className="mn-facts">
        <div className="mn-fact"><div className="mn-fact-k">Where</div><div className="mn-fact-v" title={meetup.location}>📍 {meetup.location}</div></div>
        <div className="mn-fact"><div className="mn-fact-k">People</div><div className="mn-fact-v">👥 {meetup.memberCount} joined</div></div>
        <div className="mn-fact"><div className="mn-fact-k">Time left</div><div className={`mn-fact-v${soon ? ' soon' : ''}`}>⏱ {left || 'Ended'}</div></div>
        <div className="mn-fact"><div className="mn-fact-k">Ends</div><div className="mn-fact-v">{meetup.endsWhenCreatorLeaves ? 'When host leaves' : formatEnd(meetup.expiresAt, now)}</div></div>
      </div>
      <div className="mn-hint" style={{ padding: '2px 14px 0' }}>
        {meetup.visibility === 'everyone' ? '🌐 Open to students from every college' : `🏫 For students of ${meetup.creator.college}`}
        {meetup.endsWhenCreatorLeaves && ` · ends when ${meetup.creator.name.split(' ')[0]} leaves (at the latest ${formatEnd(meetup.expiresAt, now)})`}
      </div>

      <div className="mn-section">
        <span className="mn-label">Started by</span>
        <Person person={{ ...meetup.creator, isCreator: true }} onOpen={() => nav(`/profile/${meetup.creator._id}`)} />
      </div>

      <div className="mn-section" style={{ paddingTop: 0 }}>
        <span className="mn-label">People here ({meetup.memberCount})</span>
        {meetup.members.length === 0 && <div className="mn-hint">No one else has joined yet.</div>}
        {meetup.members.map(m => <Person key={m._id} person={m} onOpen={() => nav(`/profile/${m._id}`)} />)}
        {meetup.members.length < meetup.memberCount && <div className="mn-hint" style={{ marginTop: 6 }}>Some members are hidden.</div>}
      </div>
      <p className="mn-safety">Meet in public places and tell a friend where you're going. Report anything that feels wrong.</p>

      <div className="mn-bottom">
        {meetup.joined
          ? <button className="mn-btn big" onClick={() => nav(`/meetnow/${id}/chat`)}>OPEN CHAT</button>
          : <button className="mn-btn big" onClick={join} disabled={busy}>{busy ? 'Joining…' : 'JOIN'}</button>}
      </div>

      {confirm === 'end' && (
        <Confirm title="End this MeetNow?" text="The group, its chat and its member list are deleted for everyone right away. This can't be undone."
          confirmLabel="End for everyone" busy={busy} onConfirm={() => runConfirmed('end')} onCancel={() => setConfirm(null)} />
      )}
      {confirm === 'leave' && (
        <Confirm title="Leave this MeetNow?"
          text={meetup.isCreator && meetup.endsWhenCreatorLeaves ? 'You chose "Until I leave": leaving ends it and deletes the chat for everyone.'
            : meetup.memberCount <= 1 ? 'You are the last one here: leaving ends it and deletes the chat.'
              : 'You can join again while it is running.'}
          confirmLabel="Leave" busy={busy} onConfirm={() => runConfirmed('leave')} onCancel={() => setConfirm(null)} />
      )}
      <Toast msg={msg} onClose={clear} />
    </div>
  )
}

function Person({ person, onOpen }) {
  return (
    <div className="mn-person" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter') onOpen() }}>
      <Avatar user={person} />
      <div style={{ minWidth: 0 }}>
        <div className="mn-person-name">{person.name}{person.isCreator && <span className="mn-badge">HOST</span>}</div>
        <div className="mn-person-sub">{[person.year && `${person.year} yr`, person.branch, person.college].filter(Boolean).join(' · ')}</div>
      </div>
    </div>
  )
}

export function Ended({ error, onRetry, onHome }) {
  return (
    <div className="page-wrap mn-page">
      <div className="mn-empty" style={{ paddingTop: 90 }}>
        <div className="mn-empty-icon">{error ? '📡' : '⌛'}</div>
        <h3 style={{ fontFamily: 'Fraunces, serif', color: 'var(--text)', marginBottom: 6 }}>{error ? 'Could not load this MeetNow' : 'This MeetNow has ended'}</h3>
        {error ? 'Check your connection and try again.' : 'It was deleted together with its chat.'}
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {error && <button className="mn-btn ghost" style={{ width: 'auto', padding: '0 18px' }} onClick={onRetry}>Try again</button>}
          <button className="mn-btn" style={{ width: 'auto', padding: '0 18px' }} onClick={onHome}>Back to Home</button>
        </div>
      </div>
    </div>
  )
}
