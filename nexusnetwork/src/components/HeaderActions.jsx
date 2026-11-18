import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getUnreadCount } from '../services/api'
import { NOTIFICATIONS_READ_EVENT } from '../lib/events'

// Home header, right side: the notifications bell with its unread count. It opens
// Connect → Activity → Notifications, which marks them read.
export default function HeaderActions() {
  const nav = useNavigate()
  const [unread, setUnread] = useState(0)

  const load = useCallback(() => {
    getUnreadCount().then(r => setUnread(r.data?.count || 0)).catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    window.addEventListener('focus', load)
    window.addEventListener(NOTIFICATIONS_READ_EVENT, load)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', load)
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, load)
    }
  }, [load])

  return (
    <button className="hdr-btn" onClick={() => nav('/connect?tab=activity&sub=notifications')}
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {unread > 0 && <span className="hdr-badge">{unread > 99 ? '99+' : unread}</span>}
    </button>
  )
}
