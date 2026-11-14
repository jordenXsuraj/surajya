import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Toast from '../../components/Toast'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../context/realtime'
import {
  endMeetup, getMeetup, getMeetupMessages, leaveMeetup, reportMeetup, reportMeetupMessage,
  sendMeetupMessage, reportEmailNotVerified,
} from '../../services/api'
import { request } from '../../lib/socket'
import { mergeMessages, messageTime, startsGroup, timeLeft } from './meta'
import { Avatar, BackButton, Confirm, Menu } from './parts'
import { REPORT_REASONS, errorText, useNow } from './util'
import { Ended } from './MeetNowDetails'
import './meetnow.css'

const PAGE = 50

// /meetnow/:id/chat — the temporary group chat (members only, text only)
export default function MeetNowChat() {
  const { id } = useParams()
  const nav = useNavigate()
  const now = useNow()
  const { user } = useAuth()
  const { socket, connected } = useRealtime()
  const { msg: toast, show, clear } = useToast()
  const [meetup, setMeetup] = useState(null)
  const [messages, setMessages] = useState([])
  const [state, setState] = useState('loading')   // loading | ready | gone | error
  const [hasOlder, setHasOlder] = useState(false)
  const [text, setText] = useState('')
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [reportingId, setReportingId] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const listRef = useRef(null)
  const stickToBottom = useRef(true)
  const reloadTimer = useRef(null)
  const tempSeq = useRef(0)

  const handleError = useCallback(err => {
    const code = err?.response?.data?.code
    if (err?.response?.status === 404) setState('gone')
    else if (code === 'NOT_A_MEMBER') nav(`/meetnow/${id}`, { replace: true })
    else return false
    return true
  }, [id, nav])

  const loadMeetup = useCallback(() => getMeetup(id).then(r => setMeetup(r.data)), [id])
  const loadLatest = useCallback(() => getMeetupMessages(id).then(r => {
    setMessages(m => mergeMessages(m, r.data))
    return r.data
  }), [id])

  useEffect(() => {
    let alive = true
    Promise.all([loadMeetup(), loadLatest()])
      .then(([, latest]) => { if (alive) { setHasOlder(latest.length >= PAGE); setState('ready') } })
      .catch(err => { if (alive && !handleError(err)) setState('error') })
    return () => { alive = false }
  }, [loadMeetup, loadLatest, handleError])

  // Live messages, member changes and the end; subscribe again after every reconnect
  useEffect(() => {
    if (!socket || !connected || state !== 'ready') return
    let active = true
    request(socket, 'meetup:subscribe', { meetupId: id }).then(r => {
      if (!active) return
      if (r.code === 'MEETUP_NOT_FOUND') setState('gone')
      else if (r.code === 'NOT_A_MEMBER') nav(`/meetnow/${id}`, { replace: true })
    })
    loadLatest().catch(() => {})   // what arrived while we were offline
    const onMessage = m => { if (String(m.meetup) === id) setMessages(list => mergeMessages(list, [m])) }
    const onMembers = p => {
      if (p.meetupId !== id) return
      setMeetup(m => (m ? { ...m, memberCount: p.memberCount } : m))
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(() => loadMeetup().catch(() => {}), 800)
    }
    const onEnded = p => { if (p.meetupId === id) setState('gone') }
    socket.on('meetup:message', onMessage)
    socket.on('meetup:members', onMembers)
    socket.on('meetup:ended', onEnded)
    return () => {
      active = false
      socket.emit('meetup:unsubscribe', { meetupId: id })
      socket.off('meetup:message', onMessage)
      socket.off('meetup:members', onMembers)
      socket.off('meetup:ended', onEnded)
      clearTimeout(reloadTimer.current)
    }
  }, [socket, connected, state, id, nav, loadLatest, loadMeetup])

  // No live connection: check for new messages every 8 s
  useEffect(() => {
    if (connected || state !== 'ready') return
    const t = setInterval(() => loadLatest().catch(err => handleError(err)), 8000)
    return () => clearInterval(t)
  }, [connected, state, loadLatest, handleError])

  // Keep the view at the newest message unless the user scrolled up to read
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages.length, state])
  const onScroll = () => {
    const el = listRef.current
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function loadOlder() {
    const first = messages.find(m => !m.pending)
    if (!first) return
    const el = listRef.current
    const before = el.scrollHeight
    try {
      const { data } = await getMeetupMessages(id, first.createdAt)
      setHasOlder(data.length >= PAGE)
      stickToBottom.current = false
      setMessages(m => mergeMessages(m, data))
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - before })
    } catch (err) { if (!handleError(err)) show(`⚠️ ${errorText(err)}`) }
  }

  async function send(retry) {
    const body = (retry?.text ?? text).trim()
    if (!body) return
    const tempId = retry?._id ?? `tmp-${++tempSeq.current}`
    const pending = { _id: tempId, kind: 'text', text: body, createdAt: retry?.createdAt ?? new Date().toISOString(), sender: { _id: user._id, name: user.name, avatar: user.avatar }, pending: true }
    stickToBottom.current = true
    setMessages(m => mergeMessages(m.filter(x => x._id !== tempId), [pending]))
    if (!retry) setText('')
    try {
      const { data } = await sendMeetupMessage(id, body)
      setMessages(m => mergeMessages(m.filter(x => x._id !== tempId), [data]))
    } catch (err) {
      if (handleError(err)) return
      setMessages(m => m.map(x => (x._id === tempId ? { ...x, pending: false, failed: true } : x)))
      if (!reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err, 'Not sent.')}`)
    }
  }

  async function report(messageId, reason) {
    setReportingId(null)
    try {
      if (messageId) await reportMeetupMessage(id, messageId, reason)
      else await reportMeetup(id, reason)
      show('✅ Report submitted. Thank you.')
    } catch (err) { if (!handleError(err) && !reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err)}`) }
  }

  async function runConfirmed(action) {
    setBusy(true)
    try {
      if (action === 'end') await endMeetup(id)
      else {
        const { data } = await leaveMeetup(id)
        if (!data.ended) { nav(`/meetnow/${id}`, { replace: true }); return }
      }
      nav('/home', { replace: true })
    } catch (err) {
      if (!handleError(err)) show(`⚠️ ${errorText(err)}`)
      setBusy(false)
    }
  }

  if (state === 'loading') return <div className="page-wrap mn-page"><div className="feed-loading">Loading chat…</div></div>
  // its time ran out while the page is open (the server refuses it from that second on)
  const expired = Boolean(meetup) && new Date(meetup.expiresAt) <= now
  if (state !== 'ready' || !meetup || expired) return <Ended error={state === 'error'} onRetry={() => window.location.reload()} onHome={() => nav('/home', { replace: true })} />

  const left = timeLeft(meetup.expiresAt, now)
  const menu = [
    { label: 'ℹ️ Details and members', onClick: () => nav(`/meetnow/${id}`) },
    { label: meetup.isCreator ? '🚪 Leave (it keeps running)' : '🚪 Leave MeetNow', onClick: () => setConfirm('leave') },
    ...(meetup.isCreator ? [{ label: '⛔ End MeetNow for everyone', onClick: () => setConfirm('end'), danger: true }]
      : [{ label: '🚩 Report MeetNow', report: reason => report(null, reason) }]),
  ]

  return (
    <div className="mn-chat">
      <div className="mn-topbar">
        <BackButton onClick={() => nav('/home')} />
        <div className="mn-topbar-title" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
          onClick={() => nav(`/meetnow/${id}`)} onKeyDown={e => { if (e.key === 'Enter') nav(`/meetnow/${id}`) }}>
          {meetup.title}
          <div className="mn-topbar-sub">{meetup.memberCount} {meetup.memberCount === 1 ? 'member' : 'members'} · {left || 'ending'}{meetup.isCreator ? ' · you host' : ` · host ${meetup.creator.name.split(' ')[0]}`}</div>
        </div>
        <div className="mn-stack" aria-hidden="true">{meetup.members.slice(0, 3).map(m => <Avatar key={m._id} user={m} small />)}</div>
        <Menu items={menu} />
      </div>
      {!connected && <div className="mn-banner" role="status">Reconnecting… messages may arrive a little late</div>}

      <div className="mn-messages" ref={listRef} onScroll={onScroll} aria-live="polite">
        {hasOlder && <button className="mn-view-all" style={{ alignSelf: 'center', marginBottom: 8 }} onClick={loadOlder}>Load earlier messages</button>}
        {!hasOlder && <div className="mn-system">This chat is deleted for everyone when the MeetNow ends.</div>}
        {messages.map((m, i) => {
          if (m.kind === 'system') return <div key={m._id} className="mn-system">{m.text}</div>
          const mine = m.sender?._id === user._id
          const first = startsGroup(messages[i - 1], m)
          return (
            <div key={m._id} className={`mn-msg${mine ? ' mine' : ''}${first ? ' first' : ''}${activeId === m._id ? ' active' : ''}`}
              onClick={() => setActiveId(id => (id === m._id ? null : m._id))}>
              {!mine && (first ? <Avatar user={m.sender} small /> : <div className="mn-msg-spacer" />)}
              <div className="mn-msg-col">
                {!mine && first && <div className="mn-msg-name">{m.sender?.name}</div>}
                <div className={`mn-bubble${m.hidden ? ' hidden' : ''}`}>{m.hidden ? 'Message from a blocked account' : m.text}</div>
                <div className="mn-msg-meta">
                  <span>{messageTime(m.createdAt)}</span>
                  {mine && m.pending && <span>Sending…</span>}
                  {mine && !m.pending && !m.failed && <span aria-label="Sent">✓</span>}
                  {m.failed && <button onClick={e => { e.stopPropagation(); send(m) }} style={{ color: '#ff5a73' }}>Not sent · Retry</button>}
                  {!mine && !m.hidden && reportingId !== m._id && <button className="mn-report" onClick={e => { e.stopPropagation(); setReportingId(m._id) }}>Report</button>}
                </div>
                {reportingId === m._id && (
                  <div className="mn-chips" style={{ marginTop: 4 }}>
                    {REPORT_REASONS.map(([val, label]) => (
                      <button key={val} className="mn-chip" style={{ padding: '5px 9px', fontSize: '.64rem' }} onClick={e => { e.stopPropagation(); report(m._id, val) }}>{label}</button>
                    ))}
                    <button className="mn-chip" style={{ padding: '5px 9px', fontSize: '.64rem' }} onClick={e => { e.stopPropagation(); setReportingId(null) }}>Cancel</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <form className="mn-composer" onSubmit={e => { e.preventDefault(); send() }}>
        <textarea rows={1} placeholder="Message…" maxLength={1000} value={text} aria-label="Message"
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button type="submit" className="mn-send" disabled={!text.trim()} aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" /></svg>
        </button>
      </form>

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
      <Toast msg={toast} onClose={clear} />
    </div>
  )
}
