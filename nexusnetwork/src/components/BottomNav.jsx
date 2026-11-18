import { useNavigate, useLocation } from 'react-router-dom'
import { useRealtime } from '../context/realtime'
import { useDmUnread } from '../features/messages/unread'

let navigating = false

// Home · Chat (only when direct messages are available) · Post (centre) · Connect · Profile.
// The Following feed is a choice in Home's feed filter now (/feed redirects there).
const HOME = {
  to: '/home', id: 'home', label: 'Home',
  icon: active => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
}
const POST = {
  // the same red "+" centre button as before
  to: '/post', id: 'post', label: 'Post', isCenter: true,
  icon: () => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.5}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
}
const CONNECT = {
  to: '/connect', id: 'connect', label: 'Connect',
  icon: active => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.5" y2="16.5" />
      <circle cx="17" cy="7" r="3" fill={active ? 'var(--accent)' : 'none'} stroke={active ? 'var(--accent)' : 'var(--dim)'} strokeWidth="1.5" />
      <path d="M16 7l1 1 2-2" stroke={active ? '#fff' : 'var(--dim)'} strokeWidth="1.5" fill="none" />
    </svg>
  ),
}
const CHAT = {
  to: '/messages', id: 'chat', label: 'Chat',
  icon: active => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-4.1-1L3 20l1.2-4.4A8.4 8.4 0 1 1 21 11.5z" />
      <circle cx="8" cy="11.5" r=".6" fill="currentColor" />
      <circle cx="12" cy="11.5" r=".6" fill="currentColor" />
      <circle cx="16" cy="11.5" r=".6" fill="currentColor" />
    </svg>
  ),
}
const PROFILE = {
  to: '/profile', id: 'profile', label: 'Profile',
  icon: active => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
}

export default function BottomNav() {
  const { features } = useRealtime()
  return features.dm ? <Nav tabs={[HOME, CHAT, POST, CONNECT, PROFILE]} withChat /> : <Nav tabs={[HOME, POST, CONNECT, PROFILE]} />
}

// The unread hook only runs when the Chat tab exists
function Nav({ tabs, withChat }) {
  return withChat ? <NavWithChat tabs={tabs} /> : <NavItems tabs={tabs} badges={{}} />
}
function NavWithChat({ tabs }) {
  const { total } = useDmUnread()
  return <NavItems tabs={tabs} badges={{ chat: total }} />
}

function NavItems({ tabs, badges }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className={`bottom-nav bn-${tabs.length}`} aria-label="Main">
      {tabs.map(t => {
        const active = pathname.startsWith(t.to)
        const badge = badges[t.id] || 0
        return (
          <button
            key={t.id}
            className={`bn-item${t.isCenter ? ' bn-center' : ''}${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            aria-label={badge ? `${t.label}, ${badge} unread` : t.label}
            onClick={() => {
              if (navigating) return
              navigating = true
              if (pathname === t.to) {
                // same tab again: Home refreshes and scrolls up
                window.dispatchEvent(new Event('refreshHome'))
                window.scrollTo({ top: 0, behavior: 'smooth' })
              } else {
                nav(t.to, { state: { fromNav: true } })
              }
              setTimeout(() => { navigating = false }, 300)
            }}
          >
            <div className="bn-icon">
              {t.icon(active)}
              {badge > 0 && <span className="bn-badge">{badge > 99 ? '99+' : badge}</span>}
            </div>
            <span className="bn-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
