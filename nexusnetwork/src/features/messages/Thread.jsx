import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import Toast from '../../components/Toast'
import { useToast } from '../../hooks/useToast'
import { useAuth } from '../../context/AuthContext'
import { useRealtime } from '../../context/realtime'
import {
  acceptMessageRequest, blockUser, declineMessageRequest, deleteConversation, deleteDirectMessage,
  getConversation, getDirectMessages, getDirectMessagesAfter, markConversationRead, reportDirectMessage, reportUser,
  sendDirectMessage, unblockUser, uploadDmImage, reportEmailNotVerified,
} from '../../services/api'
import { errorText, useNow } from '../../lib/ui'
import { catchUpMessages, lastServerMessage } from '../../lib/catchUp'
import { activityLabel, dayLabel, mergeMessages, messageClock, photoBox, receiptFor, startsGroup } from './meta'
import { announceRead } from './unread'
import { Avatar, BackButton, Confirm, ReportSheet, Sheet } from './parts'
import './messages.css'

const PAGE = 50

// Shrink a photo to at most 1280 px as JPEG before upload; the original if the browser can't read it
function compressPhoto(file) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(b => resolve(b ? new File([b], 'photo.jpg', { type: 'image/jpeg' }) : file), 'image/jpeg', 0.85)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// /messages/:id — one private conversation
export default function Thread() {
  const { id } = useParams()
  const nav = useNavigate()
  const now = useNow(30000)
  const { user, updateUser } = useAuth()
  const { socket, connected } = useRealtime()
  const { msg: toast, show, clear } = useToast()
  const [conv, setConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [state, setState] = useState('loading')   // loading | ready | gone | error
  const [hasOlder, setHasOlder] = useState(false)
  const [typing, setTyping] = useState(false)
  const [text, setText] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [sheet, setSheet] = useState(null)        // a message whose actions are open
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(null) // 'user' | message id
  const [confirm, setConfirm] = useState(null)    // { kind, message? }
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState(null)
  const listRef = useRef(null)
  const fileRef = useRef(null)
  const stickToBottom = useRef(true)
  const lastTyping = useRef(0)
  const tempSeq = useRef(0)
  const readTimer = useRef(null)
  const typingTimer = useRef(null)

  const markRead = useCallback(() => {
    clearTimeout(readTimer.current)
    readTimer.current = setTimeout(() => { markConversationRead(id).then(announceRead).catch(() => {}) }, 300)
  }, [id])

  const loadConv = useCallback(() => getConversation(id).then(r => setConv(r.data)), [id])
  const loadLatest = useCallback(() => getDirectMessages(id).then(r => {
    setMessages(m => mergeMessages(m.filter(x => !x._id.startsWith('tmp-') || x.pending || x.failed), r.data))
    return r.data
  }), [id])
  // after a reconnect: everything since the last message we have (or the latest page if none)
  const messagesRef = useRef(messages)
  useEffect(() => { messagesRef.current = messages }, [messages])
  const catchUp = useCallback(async () => {
    const last = lastServerMessage(messagesRef.current)
    if (!last) return loadLatest()
    const missed = await catchUpMessages(after => getDirectMessagesAfter(id, after), last.createdAt)
    if (missed.length) setMessages(m => mergeMessages(m, missed))
    if (missed.some(x => !x.mine) && document.visibilityState === 'visible') markRead()
    // unsent while we were away: the newest page tells what is still there
    const { data } = await getDirectMessages(id)
    const kept = new Set(data.map(x => x._id))
    const oldest = data[0]?.createdAt
    setMessages(m => m.filter(x => x.pending || x.failed || String(x._id).startsWith('tmp-') || !oldest || x.createdAt < oldest || kept.has(x._id)))
  }, [id, loadLatest, markRead])

  useEffect(() => {
    let alive = true
    Promise.all([loadConv(), loadLatest()])
      .then(([, latest]) => { if (alive) { setHasOlder(latest.length >= PAGE); setState('ready'); markRead() } })
      .catch(err => { if (alive) setState(err.response?.status === 404 ? 'gone' : 'error') })
    return () => { alive = false }
  }, [loadConv, loadLatest, markRead])

  // Live events for this conversation; catch up after every reconnect
  useEffect(() => {
    if (!socket || !connected || state !== 'ready') return
    catchUp().catch(() => {})   // (re)connected: fetch what we missed right away
    loadConv().catch(() => {})
    const mine = p => p.conversationId === id
    const onNew = p => {
      if (!mine(p)) return
      setMessages(list => mergeMessages(list, [p.message]))
      if (!p.message.mine) {
        clearTimeout(typingTimer.current)
        setTyping(false)
        if (document.visibilityState === 'visible') markRead()
        else socket.emit('dm:delivered', { conversationId: id })
      }
    }
    const onTyping = p => {
      if (!mine(p)) return
      setTyping(true)
      clearTimeout(typingTimer.current)
      typingTimer.current = setTimeout(() => setTyping(false), 4500)
    }
    const onDelivered = p => { if (mine(p)) setMessages(list => list.map(m => (m.mine && !m.deliveredAt && !m.pending ? { ...m, deliveredAt: p.at } : m))) }
    const onRead = p => { if (mine(p)) setConv(c => (c ? { ...c, otherLastReadAt: p.at } : c)) }
    const onUnsent = p => { if (mine(p)) setMessages(list => list.filter(m => m._id !== p.messageId)) }
    const onPresence = p => setConv(c => (c && c.other._id === p.userId ? { ...c, activity: { online: p.online, lastActiveAt: p.lastActiveAt } } : c))
    const onAccepted = p => { if (mine(p)) loadConv().catch(() => {}) }
    const onRemoved = p => { if (mine(p)) setState('gone') }
    const handlers = { 'dm:new': onNew, 'dm:typing': onTyping, 'dm:delivered': onDelivered, 'dm:read': onRead, 'dm:unsent': onUnsent, 'dm:presence': onPresence, 'dm:accepted': onAccepted, 'dm:removed': onRemoved }
    Object.entries(handlers).forEach(([e, h]) => socket.on(e, h))
    return () => Object.entries(handlers).forEach(([e, h]) => socket.off(e, h))
  }, [socket, connected, state, id, catchUp, loadConv, markRead])

  // No live connection (server waking up, or a network that blocks WebSockets): the same catch-up
  // every 8 s, so new and unsent messages, receipts and the request status still update
  useEffect(() => {
    if (connected || state !== 'ready') return
    const t = setInterval(() => { catchUp().catch(() => {}); loadConv().catch(() => {}) }, 8000)
    return () => clearInterval(t)
  }, [connected, state, catchUp, loadConv])

  // Coming back to the tab reads what arrived meanwhile
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible' && state === 'ready') markRead() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [state, markRead])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages.length, state, typing])
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
      const { data } = await getDirectMessages(id, first.createdAt)
      setHasOlder(data.length >= PAGE)
      stickToBottom.current = false
      setMessages(m => mergeMessages(m, data))
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - before })
    } catch (err) { show(`⚠️ ${errorText(err)}`) }
  }

  function onType(value) {
    setText(value)
    if (conv?.status === 'active' && socket?.connected && Date.now() - lastTyping.current > 3000 && value.trim()) {
      lastTyping.current = Date.now()
      socket.emit('dm:typing', { conversationId: id })
    }
  }

  async function send({ retry, photo } = {}) {
    const body = retry ? retry.text : text.trim()
    if (!body && !photo && !retry?.photoFile) return
    const tempId = retry?._id ?? `tmp-${++tempSeq.current}`
    const file = retry?.photoFile ?? photo
    const reply = retry ? retry.replyTo : replyTo && { message: replyTo._id, text: (replyTo.text || '').slice(0, 120), image: Boolean(replyTo.image), senderName: replyTo.mine ? user.name : conv.other.name }
    const preview = file ? (retry?.image ?? { url: URL.createObjectURL(file), width: null, height: null }) : null
    stickToBottom.current = true
    setMessages(m => mergeMessages(m.filter(x => x._id !== tempId), [{
      _id: tempId, mine: true, text: body, image: preview, replyTo: reply, createdAt: retry?.createdAt ?? new Date().toISOString(),
      pending: true, photoFile: file,
    }]))
    if (!retry) { setText(''); setReplyTo(null) }
    try {
      let image = null
      if (file) {
        const fd = new FormData()
        fd.append('image', await compressPhoto(file))
        image = (await uploadDmImage(fd)).data
      }
      const { data } = await sendDirectMessage(id, {
        text: body || undefined, replyTo: reply?.message,
        ...(image && { imageUrl: image.url, imageWidth: image.width ?? undefined, imageHeight: image.height ?? undefined }),
      })
      setMessages(m => mergeMessages(m.filter(x => x._id !== tempId), [data]))
      if (conv.isRequest && !conv.requestedByMe) loadConv().catch(() => {})   // replying accepted the request
    } catch (err) {
      setMessages(m => m.map(x => (x._id === tempId ? { ...x, pending: false, failed: true } : x)))
      if (!reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err, 'Not sent.')}`)
      if (['BLOCKED', 'REQUEST_PENDING'].includes(err.response?.data?.code)) loadConv().catch(() => {})
    }
  }

  function pickPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) return show('⚠️ Choose a photo')
    if (file.size > 15 * 1024 * 1024) return show('⚠️ Photo is too large')
    send({ photo: file })
  }

  async function run(action, done) {
    setBusy(true)
    try { await action(); done?.() }
    catch (err) { if (!reportEmailNotVerified(err.response?.status, err.response?.data)) show(`⚠️ ${errorText(err)}`) }
    finally { setBusy(false) }
  }

  const accept = () => run(() => acceptMessageRequest(id), () => { loadConv(); show('Request accepted') })
  const decline = () => run(() => declineMessageRequest(id), () => { announceRead(); nav('/messages', { replace: true }) })
  const removeChat = () => run(() => deleteConversation(id), () => { announceRead(); nav('/messages', { replace: true }) })
  const block = () => run(async () => {
    await blockUser(conv.other._id)
    updateUser({ blockedUsers: [...(user.blockedUsers || []), conv.other._id] })
  }, () => { setConfirm(null); loadConv(); show(`${conv.other.name} is blocked`) })
  const unblock = () => run(async () => {
    await unblockUser(conv.other._id)
    updateUser({ blockedUsers: (user.blockedUsers || []).filter(x => String(x?._id ?? x) !== conv.other._id) })
  }, () => { loadConv(); show(`${conv.other.name} is unblocked`) })
  const unsend = m => run(() => deleteDirectMessage(id, m._id, true), () => { setConfirm(null); setMessages(list => list.filter(x => x._id !== m._id)) })
  const hideForMe = m => run(() => deleteDirectMessage(id, m._id, false), () => setMessages(list => list.filter(x => x._id !== m._id)))
  const report = reason => {
    const target = reporting
    setReporting(null)
    run(() => (target === 'user' ? reportUser(conv.other._id, reason) : reportDirectMessage(id, target, reason)), () => show('✅ Report submitted. Thank you.'))
  }

  if (state === 'loading') return <div className="page-wrap dm-page"><div className="feed-loading">Loading…</div></div>
  if (state !== 'ready' || !conv) {
    return (
      <div className="page-wrap dm-page">
        <div className="dm-empty" style={{ paddingTop: 90 }}>
          <div className="dm-empty-icon">{state === 'error' ? '📡' : '💬'}</div>
          {state === 'error' ? 'Could not load this conversation.' : 'This conversation is no longer available.'}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'center' }}>
            {state === 'error' && <button className="dm-btn ghost" onClick={() => window.location.reload()}>Try again</button>}
            <button className="dm-btn" onClick={() => nav('/messages', { replace: true })}>All messages</button>
          </div>
        </div>
      </div>
    )
  }

  const other = conv.other
  const iBlocked = (user.blockedUsers || []).some(x => String(x?._id ?? x) === other._id)
  const incomingRequest = conv.isRequest && !conv.requestedByMe
  const outgoingRequest = conv.isRequest && conv.requestedByMe
  const sentMine = messages.some(m => m.mine && !m.failed)
  const activity = activityLabel(conv.activity, now)
  const lastMine = [...messages].reverse().find(m => m.mine)

  const headerMenu = [
    { label: '👤 View profile', onClick: () => nav(`/profile/${other._id}`) },
    { label: '🗑️ Delete chat', onClick: () => setConfirm({ kind: 'delete' }) },
    iBlocked ? { label: '✅ Unblock', onClick: unblock } : { label: '⛔ Block', onClick: () => setConfirm({ kind: 'block' }), danger: true },
    { label: '🚩 Report account', onClick: () => setReporting('user'), danger: true },
  ]
  const messageActions = m => [
    ...(!conv.blocked && !conv.isRequest ? [{ label: '↩️ Reply', onClick: () => setReplyTo(m) }] : []),
    ...(m.text ? [{ label: '📋 Copy text', onClick: () => navigator.clipboard?.writeText(m.text).then(() => show('Copied')) }] : []),
    ...(m.mine ? [{ label: '↶ Unsend', onClick: () => setConfirm({ kind: 'unsend', message: m }), danger: true }] : []),
    { label: '🙈 Delete for you', onClick: () => hideForMe(m) },
    ...(!m.mine ? [{ label: '🚩 Report message', onClick: () => setReporting(m._id), danger: true }] : []),
  ]

  return (
    <div className="dm-thread">
      <div className="dm-topbar">
        <BackButton onClick={() => nav('/messages')} />
        <button className="dm-head" onClick={() => nav(`/profile/${other._id}`)}>
          <Avatar user={other} size={36} online={conv.activity?.online} />
          <span style={{ minWidth: 0 }}>
            <div className="dm-head-name">{other.name}</div>
            <div className={`dm-head-sub${conv.activity?.online ? ' live' : ''}`}>{typing ? 'typing…' : activity || (other.username ? `@${other.username}` : other.college)}</div>
          </span>
        </button>
        <button className="dm-more" onClick={() => setMenu(true)} aria-label="Conversation options">⋯</button>
      </div>
      {!connected && <div className="dm-banner" role="status">Reconnecting… new messages may arrive a little late</div>}

      <div className="dm-messages" ref={listRef} onScroll={onScroll} aria-live="polite">
        {hasOlder
          ? <button className="dm-btn ghost" style={{ alignSelf: 'center', height: 30, fontSize: '.7rem' }} onClick={loadOlder}>Load earlier messages</button>
          : (
            <div className="dm-intro">
              <Avatar user={other} size={64} />
              <div className="dm-intro-name">{other.name}</div>
              <div className="dm-hint">{[other.year && `${other.year} yr`, other.branch, other.college].filter(Boolean).join(' · ')}</div>
              <button className="dm-btn ghost" style={{ height: 30, fontSize: '.7rem' }} onClick={() => nav(`/profile/${other._id}`)}>View profile</button>
            </div>
          )}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString()
          const first = newDay || startsGroup(prev, m)
          const box = m.image && photoBox(m.image)
          return (
            <div key={m._id} style={{ display: 'contents' }}>
              {newDay && <div className="dm-day">{dayLabel(m.createdAt, now)}</div>}
              <div className={`dm-msg${m.mine ? ' mine' : ''}${first ? ' first' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''}`}>
                {m.replyTo && <div className="dm-quote">↩ {m.replyTo.senderName}: {m.replyTo.text || (m.replyTo.image ? '📷 Photo' : '')}</div>}
                {m.image && <img className="dm-photo" src={m.image.url} alt="Photo" width={box.width} height={box.height} style={{ width: box.width, height: box.height }} loading="lazy"
                  onClick={() => (m.pending || m.failed ? null : setViewer(m.image.url))} />}
                {m.text && <button className="dm-bubble" onClick={() => !m.pending && !m.failed && setSheet(m)}>{m.text}</button>}
                {!m.text && m.image && !m.pending && !m.failed && <button className="dm-msg-meta" style={{ background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setSheet(m)}>⋯</button>}
                {m.failed
                  ? <button className="dm-msg-meta failed" style={{ background: 'none', border: 'none' }} onClick={() => send({ retry: m })}>Not sent · Tap to retry</button>
                  : (m === lastMine || !m.mine) && (
                    <div className="dm-msg-meta">
                      {messageClock(m.createdAt)}{m === lastMine && ` · ${receiptFor(m, conv.otherLastReadAt)}`}
                    </div>
                  )}
              </div>
            </div>
          )
        })}
        {typing && <div className="dm-typing" aria-label={`${other.name} is typing`}><span /><span /><span /></div>}
      </div>

      {conv.blocked ? (
        <div className="dm-panel">
          <div className="dm-panel-text">{iBlocked ? <>You blocked <strong>{other.name}</strong>.</> : "You can't message this account."}</div>
          {iBlocked && <button className="dm-btn ghost" onClick={unblock} disabled={busy}>Unblock</button>}
        </div>
      ) : incomingRequest ? (
        <div className="dm-panel">
          <div className="dm-panel-text"><strong>{other.name}</strong> wants to send you a message. They won't know you've seen it until you accept.</div>
          <div className="dm-panel-actions">
            <button className="dm-btn" onClick={accept} disabled={busy}>Accept</button>
            <button className="dm-btn ghost" onClick={decline} disabled={busy}>Delete</button>
            <button className="dm-btn danger" onClick={() => setConfirm({ kind: 'block' })} disabled={busy}>Block</button>
            <button className="dm-btn danger" onClick={() => setReporting('user')} disabled={busy}>Report</button>
          </div>
        </div>
      ) : outgoingRequest && sentMine ? (
        <div className="dm-panel">
          <div className="dm-panel-text">Message request sent. You can send more messages once <strong>{other.name}</strong> accepts.</div>
        </div>
      ) : (
        <>
          {outgoingRequest && <div className="dm-panel" style={{ padding: '8px 14px' }}><div className="dm-panel-text">{other.name} doesn't follow you: your first message goes to their requests. Text only.</div></div>}
          {replyTo && (
            <div className="dm-replybar">
              <div>Replying to {replyTo.mine ? 'yourself' : other.name}: {replyTo.text || '📷 Photo'}</div>
              <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">✕</button>
            </div>
          )}
          <form className="dm-composer" onSubmit={e => { e.preventDefault(); send() }}>
            {!outgoingRequest && (
              <>
                <button type="button" className="dm-round" onClick={() => fileRef.current?.click()} aria-label="Send a photo">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3.5" /><path d="M8 5l1.5-2h5L16 5" /></svg>
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
              </>
            )}
            <textarea rows={1} placeholder="Message…" maxLength={2000} value={text} aria-label="Message"
              onChange={e => onType(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
            <button type="submit" className="dm-round send" disabled={!text.trim()} aria-label="Send">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.1 15 12 3.4 13.9z" /></svg>
            </button>
          </form>
        </>
      )}

      {menu && <Sheet title={other.name} items={headerMenu} onClose={() => setMenu(false)} />}
      {sheet && <Sheet items={messageActions(sheet)} onClose={() => setSheet(null)} />}
      {reporting && <ReportSheet title={reporting === 'user' ? `Report ${other.name}` : 'Report this message'} onReport={report} onClose={() => setReporting(null)} />}
      {confirm?.kind === 'delete' && (
        <Confirm title="Delete this chat?" text={`It disappears from your messages. ${other.name} keeps their copy; when both of you delete it, the messages are deleted for good.`}
          confirmLabel="Delete" danger busy={busy} onConfirm={removeChat} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'block' && (
        <Confirm title={`Block ${other.name}?`} text="They can't message you or see your profile and posts. They won't be told."
          confirmLabel="Block" danger busy={busy} onConfirm={block} onCancel={() => setConfirm(null)} />
      )}
      {confirm?.kind === 'unsend' && (
        <Confirm title="Unsend this message?" text="It's deleted for both of you, including any photo."
          confirmLabel="Unsend" danger busy={busy} onConfirm={() => unsend(confirm.message)} onCancel={() => setConfirm(null)} />
      )}
      {viewer && createPortal(<div className="dm-viewer" role="dialog" aria-label="Photo" onClick={() => setViewer(null)}><img src={viewer} alt="" /></div>, document.body)}
      <Toast msg={toast} onClose={clear} />
    </div>
  )
}
