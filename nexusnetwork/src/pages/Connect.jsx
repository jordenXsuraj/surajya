

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { NOTIFICATIONS_READ_EVENT } from '../lib/events'
import FilterDropdown from '../components/FilterDropdown'
import { useAuth } from '../context/AuthContext'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'
import useLoadMore from '../hooks/useLoadMore'
import { PersonSkeleton, Skeletons, ListFooter, LoadError } from '../components/Loading'
import { appendBatch } from '../lib/feedPaging'

const SKILL_FILTERS = [
  'All','React','Python','ML','Java','DSA','Embedded System','Node.js','C++','VLSI',
  'Flutter','Figma','UI/UX'
]

const COLORS = [
  { bg:'rgba(59,130,246,.15)',  color:'#3b82f6' },
  { bg:'rgba(168,85,247,.15)',  color:'#a855f7' },
  { bg:'rgba(255,59,92,.12)',   color:'#ff3b5c' },
  { bg:'rgba(34,197,94,.14)',   color:'#22c55e' },
  { bg:'rgba(245,158,11,.14)',  color:'#f59e0b' },
  { bg:'rgba(249,115,22,.13)',  color:'#f97316' },
]

// Notification type → icon + color
const NOTIF_META = {
  post_liked:          { icon:'❤️', color:'#ff3b5c',  label:'liked your post'     },
  post_replied:        { icon:'💬', color:'#3b82f6',  label:'replied to your post' },
  connection_request:  { icon:'🤝', color:'#22c55e',  label:'wants to connect'     },
  connection_accepted: { icon:'✅', color:'#22c55e',  label:'accepted your request' },
  new_post:            { icon:'📝', color:'#a855f7',  label:'shared a new post'    },
}



function ContributorBadge() {
  return (
    <span
      title="Top Contributor"
      style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        width:18,
        height:18,
        borderRadius:'50%',
        background:'linear-gradient(135deg,#f59e0b,#f97316)',
        color:'#fff',
        fontSize:'0.7rem',
        marginLeft:6,
        boxShadow:'0 2px 8px rgba(249,115,22,.35)',
        border:'1px solid rgba(255,255,255,.15)'
      }}
    >
      ★
    </span>
  )
}



function av(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(d) {
  const h = Math.floor((Date.now() - new Date(d)) / 3600000)
  if (h < 1)  return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function Avatar({ user, size = 48, index = 0 }) {
  const col = COLORS[index % COLORS.length]
  if (user?.avatar) {
    return (
      <img
        src={`${user.avatar}?f_auto&q_auto&w=100`}
        alt={user.name || ''}
        style={{ width:size, height:size, borderRadius:'50%',
          objectFit:'cover', display:'block', flexShrink:0 }}
      />
    )
  }
  return (
    <div className="av-md"
      style={{ width:size, height:size, background:col.bg,
        color:col.color, flexShrink:0,
        fontSize: size > 40 ? '.95rem' : '.75rem' }}>
      {av(user?.name)}
    </div>
  )
}

function PersonCard({ u, index, onFollow, onView, sentIds, isSuggestion }) {
  const status = u.isFollowing
    ? 'following'
    : sentIds.includes(u._id.toString())
      ? 'sent'
      : 'none'

  return (
    <div className="person-card" onClick={() => onView(u._id)} style={{ cursor:'pointer' }}>
      <div style={{ position:'relative', flexShrink:0 }}>
        <Avatar user={u} size={48} index={index} />
        {u.online && <div className="online-dot" />}
      </div>
      <div className="person-info">

        <div className="person-name" style={{ display:'flex', alignItems:'center' }}>
  {u.name}
  {u.isContributor && <ContributorBadge />}
</div>

        <div className="person-role">
          {u.year} yr {u.branch}
          {u.isSenior ? ' · 🎓' : ''}
          {u.college ? ` · ${u.college}` : ''}
        </div>
        <div className="person-skills">
          {(u.skills || []).slice(0, 3).map(s => (
            <span key={s} className="skill-tag">{s}</span>
          ))}
        </div>
        {u.projects?.[0] && (
          <span className="project-pill" onClick={e => e.stopPropagation()}>
            🔗 {u.projects[0].name}
          </span>
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
        <button
          className={`connect-btn ${status === 'following' ? 'connected' : status === 'sent' ? 'pending' : ''}`}
          onClick={e => { e.stopPropagation(); if (status === 'none') onFollow(u) }}
          disabled={status !== 'none'}
          style={{ fontSize:'.68rem', padding:'6px 12px' }}
        >
          {status === 'following' ? '✓ Following' :
           status === 'sent'      ? '⏳ Sent'     : '+ Connect'}
        </button>
        <div style={{ fontSize:'.62rem', color:'var(--dim)', textAlign:'right' }}>
          {u.followerCount || 0} followers
        </div>
      </div>
    </div>
  )
}

const PAGE = 20   // students per page (the server's page size)

const SCOPE_OPTIONS = [
  { value: 'college', icon: '🏫', label: 'My College' },
  { value: 'global',  icon: '🌐', label: 'All' },
]

export default function Connect() {
  const nav                   = useNavigate()
  const { user, refreshUser } = useAuth()
  const { msg, show, clear }  = useToast()

  // /connect?tab=activity[&sub=notifications] opens Activity directly (the bell in the Home header)
  const [params]                           = useSearchParams()
  const openActivity                       = params.get('tab') === 'activity'
  const openNotifications                  = openActivity && params.get('sub') === 'notifications'
  const [tab,              setTab]         = useState(openActivity ? 'requests' : 'find')
  const [scope,            setScope]       = useState('college')
  const [skill,            setSkill]       = useState('All')
  const [search,           setSearch]      = useState('')
  const [users,            setUsers]       = useState([])
  const [suggests,         setSuggests]    = useState([])
  const [requests,         setReqs]        = useState([])
  const [notifications,    setNotifs]      = useState([])  // ← NEW
  const [unreadCount,      setUnread]      = useState(0)   // ← NEW
  const [loading,          setLoading]     = useState(true)    // Suggested / Activity tabs
  const [searchDebounced,  setSearchD]     = useState('')
  // Find tab: pages of 20 students, loaded by themselves near the end of the list
  const [findLoading,      setFindLoading] = useState(true)
  const [hasMore,          setHasMore]     = useState(true)
  const [loadingMore,      setLoadingMore] = useState(false)
  const [moreError,        setMoreError]   = useState(false)
  const [firstError,       setFirstError]  = useState(false)
  const findGen  = useRef(0)       // bumps when a filter changes; answers for an older list are dropped
  const findBusy = useRef(false)   // one request at a time
  const nextPage = useRef(2)
  const [reqSubTab,        setReqSubTab]   = useState(openNotifications ? 'notifications' : 'requests') // 'requests' | 'notifications'

  const [sentIds, setSentIds] = useState(
    (user?.sentRequests || []).map(c => c?._id?.toString() || c?.toString() || c)
  )

const base  = import.meta.env.VITE_API_URL
const getH  = () => ({ Authorization: `Bearer ${localStorage.getItem('nx_token')}` })

  // ── Load requests + notification count on mount ───
  useEffect(() => {
    // requests badge
    axios.get(`${base}/users/requests`, { headers: getH() })
      .then(r => setReqs(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})

    // unread notifications count for badge; opened from the bell: they are read now
    axios.get(`${base}/notifications/unread-count`, { headers: getH() })
      .then(async r => {
        const count = r.data?.count || 0
        if (openNotifications && count > 0) {
          await axios.put(`${base}/notifications/mark-read`, {}, { headers: getH() })
          window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT))
          return setUnread(0)
        }
        setUnread(count)
      })
      .catch(() => {})
  }, [openNotifications])

  // ── Find tab: students page by page ───────────────
  const studentsUrl = useCallback(page => {
    const sp = new URLSearchParams()
    if (skill !== 'All')         sp.set('skill',  skill)
    if (searchDebounced.trim())  sp.set('search', searchDebounced.trim())
    sp.set('page', page)
    return `${scope === 'global' ? `${base}/users/all` : `${base}/users`}?${sp}`
  }, [base, scope, skill, searchDebounced])

  // A filter, skill or search changed (or the tab opened): start the list again, skeleton first
  const loadStudents = useCallback(() => {
    const g = ++findGen.current
    findBusy.current = true
    nextPage.current = 2
    setUsers([]); setHasMore(true); setFindLoading(true); setLoadingMore(false); setMoreError(false); setFirstError(false)
    axios.get(studentsUrl(1), { headers: getH() })
      .then(r => {
        if (g !== findGen.current) return
        const data = Array.isArray(r.data) ? r.data : []
        setUsers(appendBatch([], data))
        setHasMore(data.length >= PAGE)
      })
      .catch(() => { if (g === findGen.current) setFirstError(true) })
      .finally(() => { if (g === findGen.current) { findBusy.current = false; setFindLoading(false) } })
  }, [studentsUrl])

  const loadMoreStudents = useCallback(() => {
    if (findBusy.current || !hasMore) return
    const g = findGen.current
    const page = nextPage.current
    findBusy.current = true
    setLoadingMore(true); setMoreError(false)
    axios.get(studentsUrl(page), { headers: getH() })
      .then(r => {
        if (g !== findGen.current) return
        const data = Array.isArray(r.data) ? r.data : []
        nextPage.current = page + 1
        setUsers(prev => appendBatch(prev, data))   // de-duplicated by id; the list never reorders
        if (data.length < PAGE) setHasMore(false)
      })
      .catch(() => { if (g === findGen.current) setMoreError(true) })
      .finally(() => { if (g === findGen.current) { findBusy.current = false; setLoadingMore(false) } })
  }, [studentsUrl, hasMore])

  useEffect(() => {
    if (tab === 'find') loadStudents()
  }, [tab, loadStudents])

  const studentsSentinel = useLoadMore(loadMoreStudents, {
    enabled: tab === 'find' && hasMore && !findLoading && !moreError && users.length > 0, margin: 300, watch: users.length,
  })

  // ── Suggested / Activity tabs ─────────────────────
  useEffect(() => {
    const controller = new AbortController()
    if (tab === 'suggestions') {
      setLoading(true)
      axios.get(`${base}/users/suggestions`, { headers: getH(), signal: controller.signal })
        .then(r => setSuggests(Array.isArray(r.data) ? r.data : []))
        .catch(err => { if (err.name !== 'CanceledError') show('❌ Could not load data') })
        .finally(() => setLoading(false))
    }
    if (tab === 'requests') {
      // Load both requests and notifications in parallel
      setLoading(true)
      Promise.all([
        axios.get(`${base}/users/requests`,    { headers: getH(), signal: controller.signal }),
        axios.get(`${base}/notifications`,     { headers: getH(), signal: controller.signal }),
      ])
        .then(([reqRes, notifRes]) => {
          setReqs(Array.isArray(reqRes.data) ? reqRes.data : [])
          setNotifs(Array.isArray(notifRes.data) ? notifRes.data : [])
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
    return () => controller.abort()
  }, [tab])

  useEffect(() => {
    const t = setTimeout(() => setSearchD(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // ── Mark all notifications read when opening tab ──
  async function handleOpenNotifications() {
    setReqSubTab('notifications')
    if (unreadCount > 0) {
      try {
        await axios.put(`${base}/notifications/mark-read`, {}, { headers: getH() })
        window.dispatchEvent(new Event(NOTIFICATIONS_READ_EVENT))
        setUnread(0)
        setNotifs(p => p.map(n => ({ ...n, read: true })))
      } catch {}
    }
  }

  async function handleFollow(u) {
    if (sentIds.includes(u._id.toString()) || u.isFollowing) return
    try {
      await axios.post(`${base}/users/${u._id}/connect`, {}, { headers: getH() })
      setSentIds(p => [...p, u._id.toString()])
      show(`✅ Connect request sent to ${u.name.split(' ')[0]}!`)
      refreshUser()
    } catch (e) { show('❌ ' + (e.response?.data?.message || 'Failed')) }
  }

  async function handleAccept(u) {
    try {
      await axios.post(`${base}/users/${u._id}/accept`, {}, { headers: getH() })
      setReqs(p => p.filter(r => r._id !== u._id))
      show(`✅ Now following ${u.name.split(' ')[0]}!`)
      refreshUser()
    } catch (e) { show('❌ ' + (e.response?.data?.message || 'Failed')) }
  }

  async function handleReject(u) {
    try {
      await axios.post(`${base}/users/${u._id}/reject`, {},{ headers: getH() } )
      setReqs(p => p.filter(r => r._id !== u._id))
      show('Request removed')
    } catch (e) { show('❌ ' + (e.response?.data?.message || 'Failed')) }
  }

  // Total badge = requests + unread notifications
  const totalBadge = requests.length + unreadCount

  return (
    <div className="page-wrap">

      {/* Sticky header */}
      <div className="connect-sticky">
        <div className="connect-top">
          <h1 className="conn-title">
            {tab === 'find'        ? 'Find People 🔍' :
             tab === 'suggestions' ? 'Suggested 💡'   :
             'Activity 🔔'}
          </h1>

          {/* 3 tabs */}
          <div className="view-toggle">
            <button className={tab === 'find'        ? 'on' : ''} onClick={() => setTab('find')}>
              Find
            </button>
            <button className={tab === 'suggestions' ? 'on' : ''} onClick={() => setTab('suggestions')}>
              Suggested
            </button>
           <button className={tab === 'requests' ? 'on' : ''}onClick={() => {setTab('requests')
    // Auto-switch to correct sub-tab based on what has unread items
                   if (requests.length === 0 && unreadCount > 0) {
                      setReqSubTab('notifications')
                   } else {
                      setReqSubTab('requests')
                          }
                    }}
                  >
                   Activity {totalBadge > 0 && tab !== 'requests' && (
                  <span className="req-badge">{totalBadge}</span>
             )}
          </button>
          </div>
        </div>

        {/* Find tab controls */}
        {tab === 'find' && (
          <>
            <div className="conn-search-box">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} width={14} height={14}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" placeholder="Search by name or skill…"
                value={search} onChange={e => setSearch(e.target.value)} autoComplete="off" />
              {search && <button className="srch-x" onClick={() => setSearch('')}>✕</button>}
            </div>

            <div className="skill-filter-row">
              <div style={{ flexShrink:0 }}>
                <FilterDropdown label="Students from" value={scope} onChange={setScope} options={SCOPE_OPTIONS} />
              </div>
              <div style={{ width:1, height:22, background:'var(--br2)', flexShrink:0 }} />
              {SKILL_FILTERS.map(s => (
                <button key={s} className={`sf-pill ${skill === s ? 'on' : ''}`}
                  onClick={() => setSkill(s)}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Requests tab — sub-tabs for Requests vs Notifications */}
        {tab === 'requests' && (
          <div style={{ display:'flex', gap:8, marginTop:6 }}>
            <button
              onClick={() => setReqSubTab('requests')}
              style={{
                flex:1, padding:'8px', borderRadius:10, border:'none',
                background: reqSubTab === 'requests' ? 'var(--accent)' : 'var(--bg3)',
                color: reqSubTab === 'requests' ? 'white' : 'var(--muted)',
                fontWeight:700, fontSize:'.78rem', cursor:'pointer',
                fontFamily:'Outfit,sans-serif', transition:'all .2s',
                position:'relative',
              }}>
              🤝 Requests
              {requests.length > 0 && reqSubTab !== 'requests' && (
                <span className="req-badge" style={{ position:'absolute', top:-4, right:-4 }}>
                  {requests.length}
                </span>
              )}
            </button>
            <button
              onClick={handleOpenNotifications}
              style={{
                flex:1, padding:'8px', borderRadius:10, border:'none',
                background: reqSubTab === 'notifications' ? 'var(--accent)' : 'var(--bg3)',
                color: reqSubTab === 'notifications' ? 'white' : 'var(--muted)',
                fontWeight:700, fontSize:'.78rem', cursor:'pointer',
                fontFamily:'Outfit,sans-serif', transition:'all .2s',
                position:'relative',
              }}>
              🔔 Notifications
              {unreadCount > 0 && reqSubTab !== 'notifications' && (
                <span className="req-badge" style={{ position:'absolute', top:-4, right:-4 }}>
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── FIND TAB ── */}
      {tab === 'find' && (
        <div className="people-list">
          {findLoading && <Skeletons count={5} of={PersonSkeleton} />}
          {!findLoading && firstError && <LoadError what="students" onRetry={loadStudents} />}
          {!findLoading && !firstError && users.length === 0 && (
            <div className="conn-empty">
              <div style={{ fontSize:'2.2rem' }}>🔍</div>
              <h3>No students found</h3>
              <p>{search ? 'Try a different search' : 'No students from this college yet'}</p>
            </div>
          )}
          {!findLoading && users.map((u, i) => (
            <PersonCard key={u._id} u={u} index={i}
              onFollow={handleFollow}
              onView={id => nav(`/profile/${id}`)}
              sentIds={sentIds} isSuggestion={false} />
          ))}
          {!findLoading && (
            <ListFooter sentinel={studentsSentinel} count={users.length} loadingMore={loadingMore} error={moreError}
              hasMore={hasMore} onRetry={loadMoreStudents} onMore={loadMoreStudents} />
          )}
        </div>
      )}

      {/* ── SUGGESTIONS TAB ── */}
      {tab === 'suggestions' && (
        <div className="people-list">
          {loading && <Skeletons count={4} of={PersonSkeleton} />}
          {!loading && suggests.length === 0 && (
            <div className="conn-empty">
              <div style={{ fontSize:'2.2rem' }}>💡</div>
              <h3>No suggestions yet</h3>
              <p>Sign up more students from your college to get suggestions</p>
            </div>
          )}
          {!loading && suggests.length > 0 && (
            <div style={{ padding:'10px 14px 4px', fontSize:'.72rem', color:'var(--dim)' }}>
              Based on your branch, year, and skills
            </div>
          )}
          {!loading && suggests.map((u, i) => (
            <PersonCard key={u._id} u={u} index={i}
              onFollow={handleFollow}
              onView={id => nav(`/profile/${id}`)}
              sentIds={sentIds} isSuggestion={true} />
          ))}
        </div>
      )}

      {/* ── INBOX TAB ── */}
      {tab === 'requests' && (
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {loading && <div className="list-loading">Loading…</div>}

          {/* ── Connection Requests sub-tab ── */}
          {!loading && reqSubTab === 'requests' && (
            <>
              {requests.length === 0 && (
                <div className="conn-empty">
                  <div style={{ fontSize:'2.2rem' }}>📭</div>
                  <h3>No pending requests</h3>
                  <p>When someone wants to Connect with you, it appears here</p>
                </div>
              )}
              {requests.map((u, i) => {
                if (!u?._id) return null
                return (
                  <div key={u._id} className="request-card"
                    onClick={() => nav(`/profile/${u._id}`)}
                    style={{ cursor:'pointer' }}>
                    <Avatar user={u} size={48} index={i} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div className="person-name">{u.name || 'Unknown'}</div>
                      <div className="person-role">{u.year} yr {u.branch} · {u.college}</div>
                      <div className="person-skills" style={{ marginTop:5 }}>
                        {(u.skills || []).slice(0, 3).map(s => (
                          <span key={s} className="skill-tag">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:6 }}
                      onClick={e => e.stopPropagation()}>
                      <button className="req-accept-btn" onClick={() => handleAccept(u)}>✓ Accept</button>
                      <button className="req-reject-btn" onClick={() => handleReject(u)}>Reject</button>
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ── Notifications sub-tab ── */}
          {!loading && reqSubTab === 'notifications' && (
            <>
              {notifications.length === 0 && (
                <div className="conn-empty">
                  <div style={{ fontSize:'2.2rem' }}>🔔</div>
                  <h3>No notifications yet</h3>
                  <p>Likes, replies, and connections will appear here</p>
                </div>
              )}
              {notifications.map((n, i) => {
                const meta     = NOTIF_META[n.type] || { icon:'🔔', color:'var(--muted)' }
                const canVisit = n.sender?._id

                return (
                  <div key={n._id}
                    onClick={() => canVisit && nav(`/profile/${n.sender._id}`)}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:12,
                      padding:'12px 14px',
                      background: n.read ? 'var(--card)' : 'rgba(255,59,92,.04)',
                      border: `1px solid ${n.read ? 'var(--br)' : 'rgba(255,59,92,.15)'}`,
                      borderRadius:14,
                      cursor: canVisit ? 'pointer' : 'default',
                      transition:'all .2s',
                    }}>

                    {/* Avatar with notification icon overlay */}
                    <div style={{ position:'relative', flexShrink:0 }}>
                      <Avatar user={n.sender} size={44} index={i} />
                      <div style={{
                        position:'absolute', bottom:-2, right:-2,
                        width:20, height:20,
                        background:'var(--bg2)',
                        border:'2px solid var(--bg)',
                        borderRadius:'50%',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:'.65rem',
                      }}>
                        {meta.icon}
                      </div>
                    </div>

                    {/* Content */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'.82rem', color:'var(--text)',
                        lineHeight:1.5, marginBottom:3 }}>
                        <strong>{n.sender?.name || 'Someone'}</strong>
                        {' '}
                        <span style={{ color:'var(--muted)' }}>
                          {NOTIF_META[n.type]?.label || n.message}
                        </span>
                      </div>

                      {/* Show reply/post preview if available */}
                      {n.message && n.type === 'post_replied' && (
                        <div style={{
                          fontSize:'.72rem', color:'var(--dim)',
                          background:'var(--bg3)',
                          padding:'5px 9px', borderRadius:7,
                          marginTop:4, marginBottom:3,
                          borderLeft:'2px solid var(--br2)',
                          overflow:'hidden', textOverflow:'ellipsis',
                          whiteSpace:'nowrap', maxWidth:'100%',
                        }}>
                          {n.message}
                        </div>
                      )}

                      <div style={{ fontSize:'.65rem', color:'var(--dim)', marginTop:2 }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div style={{
                        width:8, height:8, borderRadius:'50%',
                        background:'var(--accent)', flexShrink:0, marginTop:6
                      }}/>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      <div style={{ height:14 }} />
      <Toast msg={msg} onClose={clear} />
    </div>
  )
}
