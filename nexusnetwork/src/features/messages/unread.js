import { useCallback, useEffect, useRef, useState } from 'react'
import { getDmUnread } from '../../services/api'
import { useRealtime } from '../../context/realtime'

// Unread direct messages: chats with unread messages + requests waiting. Live over the socket,
// every 60 s without one, and again when the tab comes back.
export function useDmUnread() {
  const { features, socket, connected } = useRealtime()
  const [counts, setCounts] = useState({ chats: 0, requests: 0 })
  const timer = useRef(null)

  const load = useCallback(() => {
    if (!features.dm) return
    getDmUnread().then(r => setCounts(r.data)).catch(() => {})
  }, [features.dm])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    window.addEventListener('meetnet:dm-read', onFocus)   // this tab read a conversation
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('meetnet:dm-read', onFocus)
    }
  }, [load])

  useEffect(() => {
    if (connected || !features.dm) return
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [connected, features.dm, load])

  useEffect(() => {
    if (!socket || !connected) return
    const soon = () => { clearTimeout(timer.current); timer.current = setTimeout(load, 400) }
    const events = ['dm:new', 'dm:accepted', 'dm:removed', 'dm:unsent']
    events.forEach(e => socket.on(e, soon))
    return () => {
      events.forEach(e => socket.off(e, soon))
      clearTimeout(timer.current)
    }
  }, [socket, connected, load])

  return { ...counts, total: counts.chats + counts.requests, refresh: load }
}

// Tell the badge that this tab just read a conversation
export const announceRead = () => window.dispatchEvent(new Event('meetnet:dm-read'))
