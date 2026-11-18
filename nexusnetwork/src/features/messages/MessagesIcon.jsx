import { useNavigate } from 'react-router-dom'
import { useRealtime } from '../../context/realtime'
import { useDmUnread } from './unread'
import './messages.css'

// Home header: opens the inbox, with the unread count. Nothing unless direct messages are available.
export default function MessagesIcon() {
  const { features } = useRealtime()
  if (!features.dm) return null
  return <Icon />
}

function Icon() {
  const nav = useNavigate()
  const { total } = useDmUnread()
  return (
    <button className="dm-icon-btn" onClick={() => nav('/messages')}
      aria-label={total ? `Messages, ${total} unread` : 'Messages'}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4.1-1L3 20l1.2-4.4A8.4 8.4 0 1 1 21 11.5z" />
      </svg>
      {total > 0 && <span className="dm-badge">{total > 99 ? '99+' : total}</span>}
    </button>
  )
}
