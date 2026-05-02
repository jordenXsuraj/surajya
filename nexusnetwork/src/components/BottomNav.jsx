
import { useNavigate, useLocation } from 'react-router-dom'
let navigating = false


const TABS = [
  {
    to: '/home', id: 'home', label: 'Home',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9,22 9,12 15,12 15,22" />
      </svg>
    )
  },
  {
    to: '/feed', id: 'feed', label: 'Following',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        {/* Small heart overlay to indicate "connection posts" */}
        <circle cx="19" cy="4" r="3" fill={active ? 'var(--accent)' : 'none'}
          stroke={active ? 'var(--accent)' : 'var(--dim)'} strokeWidth="1.5"/>
      </svg>
    )
  },
  {
    to: '/post', id: 'post', label: 'Post', isCenter: true,
    icon: () => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={2.5}>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
  },
 {
  to: '/connect', id: 'connect', label: 'Connect',
  icon: (active) => (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
      
      {/* Search circle */}
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.5" y2="16.5" />

      {/* Small check badge */}
      <circle 
        cx="17" 
        cy="7" 
        r="3" 
        fill={active ? 'var(--accent)' : 'none'}
        stroke={active ? 'var(--accent)' : 'var(--dim)'} 
        strokeWidth="1.5"
      />
      <path 
        d="M16 7l1 1 2-2" 
        stroke={active ? '#fff' : 'var(--dim)'} 
        strokeWidth="1.5" 
        fill="none"
      />

    </svg>
  )
},
  {
    to: '/profile', id: 'profile', label: 'Me',
    icon: (active) => (
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={active ? 2.2 : 1.8}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  },
]

export default function BottomNav() {
  const nav = useNavigate()
  const { pathname } = useLocation()



  
  return (


    <nav className="bottom-nav">
      {TABS.map(t => {
        const active = pathname.startsWith(t.to)
        return (
          <button
            key={t.id}
            className={`bn-item ${t.isCenter ? 'bn-center' : ''} ${active ? 'active' : ''}`}
           onClick={() => {
  if (navigating) return
  navigating = true

  if (pathname === t.to) {
    // 🔥 SAME TAB CLICK (Home refresh behavior)
    window.dispatchEvent(new Event('refreshHome'))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } else {
    nav(t.to, { state: { fromNav: true } })
  }

  setTimeout(() => navigating = false, 300)
}}
            aria-label={t.label}
          >
            <div className="bn-icon">{t.icon(active)}</div>
            <span className="bn-label">{t.label}</span>
          </button>
        )
      })}
    </nav>
  )
}