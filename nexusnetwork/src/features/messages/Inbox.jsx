import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRealtime } from '../../context/realtime'
import { getConversations } from '../../services/api'
import { errorText, useNow } from '../../lib/ui'
import { previewText, shortTime } from './meta'
import { useDmUnread } from './unread'
import { Avatar, BackButton } from './parts'
import './messages.css'

// /messages — Chats (accepted + requests I sent) and Requests (sent to me), with search
export default function Inbox() {
  const nav = useNavigate()
  const now = useNow(60000)
  const { socket, connected } = useRealtime()
  const { requests } = useDmUnread()
  const [tab, setTab] = useState('chats')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [data, setData] = useState({ key: null, list: [], error: '' })
  const reloadTimer = useRef(null)
  const key = `${tab}|${search}`

  // the search goes to the server 300 ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 300)
    return () => clearTimeout(t)
  }, [query])

  const load = useCallback(() => getConversations(tab, search || undefined)
    .then(r => setData({ key, list: r.data, error: '' }))
    .catch(err => setData(d => ({ key, list: d.key === key ? d.list : [], error: errorText(err, 'Could not load your messages.') }))), [tab, search, key])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (connected) return
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [connected, load])

  useEffect(() => {
    if (!socket || !connected) return
    const soon = () => { clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(load, 300) }
    const onPresence = p => setData(d => ({ ...d, list: d.list.map(c => (c.other?._id === p.userId ? { ...c, activity: { online: p.online, lastActiveAt: p.lastActiveAt } } : c)) }))
    for (const e of ['dm:new', 'dm:accepted', 'dm:removed', 'dm:unsent', 'dm:read']) socket.on(e, soon)
    socket.on('dm:presence', onPresence)
    load()
    return () => {
      for (const e of ['dm:new', 'dm:accepted', 'dm:removed', 'dm:unsent', 'dm:read']) socket.off(e, soon)
      socket.off('dm:presence', onPresence)
      clearTimeout(reloadTimer.current)
    }
  }, [socket, connected, load])

  const loading = data.key !== key
  return (
    <div className="page-wrap dm-page">
      <div className="dm-topbar">
        <BackButton onClick={() => nav(-1)} />
        <div className="dm-title">Messages<span className="beta-badge">Beta</span></div>
      </div>

      <div className="dm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'chats'} className={`dm-tab${tab === 'chats' ? ' on' : ''}`} onClick={() => setTab('chats')}>Chats</button>
        <button role="tab" aria-selected={tab === 'requests'} className={`dm-tab${tab === 'requests' ? ' on' : ''}`} onClick={() => setTab('requests')}>
          Requests{requests > 0 ? ` (${requests})` : ''}
        </button>
      </div>
      <label className="dm-search">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        <input placeholder="Search by name" value={query} onChange={e => setQuery(e.target.value)} aria-label="Search conversations" />
        {query && <button className="dm-back" style={{ width: 24, height: 24, border: 'none' }} onClick={() => setQuery('')} aria-label="Clear search">✕</button>}
      </label>
      {tab === 'requests' && <p className="dm-hint" style={{ padding: '6px 16px 0' }}>Messages from people you don't follow. They won't know you've seen them until you accept.</p>}

      {loading && <div className="dm-list">{[0, 1, 2].map(i => <div key={i} className="dm-skel" aria-hidden="true" />)}</div>}

      {!loading && data.error && (
        <div className="dm-empty">
          <div className="dm-empty-icon">📡</div>{data.error}
          <div style={{ marginTop: 12 }}><button className="dm-btn ghost" onClick={load}>Try again</button></div>
        </div>
      )}

      {!loading && !data.error && data.list.length === 0 && (
        <div className="dm-empty">
          <div className="dm-empty-icon">{tab === 'requests' ? '📭' : '💬'}</div>
          {search ? 'Nobody by that name here.'
            : tab === 'requests' ? 'No message requests.'
              : <>No messages yet.<br />Open someone's profile and tap <b>Message</b>.</>}
        </div>
      )}

      {!loading && !data.error && data.list.length > 0 && (
        <div className="dm-list">
          {data.list.map(c => (
            <button key={c._id} className={`dm-row${c.unread > 0 ? ' unread' : ''}`} onClick={() => nav(`/messages/${c._id}`)}>
              <Avatar user={c.other} online={c.activity?.online} />
              <div className="dm-row-body">
                <div className="dm-row-top">
                  <span className="dm-row-name">{c.other.name}</span>
                  {c.isRequest && c.requestedByMe && <span className="dm-pill">REQUEST SENT</span>}
                  <span className="dm-row-time">{c.lastMessage ? shortTime(c.lastMessage.at, now) : ''}</span>
                </div>
                <div className="dm-row-preview">{previewText(c.lastMessage)}</div>
              </div>
              {c.unread > 0 && <span className="dm-dot" aria-label={`${c.unread} unread`} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
