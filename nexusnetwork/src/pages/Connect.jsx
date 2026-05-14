

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

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

function av(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Avatar component — shows photo or initials ────
function Avatar({ user, size = 48, index = 0 }) {
  const col = COLORS[index % COLORS.length]
  if (user?.avatar) {
    return (
      <img
        src={`${user.avatar}?f_auto&q_auto&w=100`}
        alt={user.name || ''}
        style={{
          width: size, height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0
        }}
      />
    )
  }
  return (
    <div
      className="av-md"
      style={{
        width: size, height: size,
        background: col.bg,
        color: col.color,
        flexShrink: 0,
        fontSize: size > 40 ? '.95rem' : '.75rem'
      }}
    >
      {av(user?.name)}
    </div>
  )
}

// ── Person card ───────────────────────────────────
function PersonCard({ u, index, onFollow, onView, sentIds, isSuggestion }) {
  const status = u.isFollowing
    ? 'following'
    : sentIds.includes(u._id.toString())
      ? 'sent'
      : 'none'

  return (
    <div
      className="person-card"
      onClick={() => onView(u._id)}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <Avatar user={u} size={48} index={index} />
        {u.online && <div className="online-dot" />}
      </div>

      <div className="person-info">
        <div className="person-name">{u.name}</div>
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

        {/* Suggestion reason */}
        {isSuggestion && u.branch && (
          <div style={{ fontSize:'.65rem', color:'var(--dim)', marginTop:4 }}>
            {u.branch === (u._branchMatch) ? `Same branch · ` : ''}
            {u.followingCount > 0 ? `${u.followingCount} followers` : ''}
          </div>
        )}
      </div>

      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
        <button
          className={`connect-btn ${status === 'following' ? 'connected' : status === 'sent' ? 'pending' : ''}`}
          onClick={e => { e.stopPropagation(); if(status === 'none') onFollow(u) }}
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

// ── Main Connect Page ─────────────────────────────
export default function Connect() {
  const nav               = useNavigate()
  const { user, refreshUser } = useAuth()
  const { msg, show, clear }  = useToast()

  // Tabs: find | suggestions | requests
  const [tab,      setTab]     = useState('find')
  const [scope,    setScope]   = useState('college')
  const [skill,    setSkill]   = useState('All')
  const [search,   setSearch]  = useState('')
  const [users,    setUsers]   = useState([])
  const [suggests, setSuggests]= useState([])
  const [requests, setReqs]    = useState([])
  const [loading,  setLoading] = useState(true)
  const [searchDebounced, setSearchDebounced] = useState('')
  const [page,    setPage]    = useState(1)
const [hasMore, setHasMore] = useState(true)
const [loadingMore, setLoadingMore] = useState(false)
  const [sentIds,  setSentIds] = useState(
    (user?.sentRequests || []).map(c => c?._id?.toString() || c?.toString() || c)
  )

  /*
  const token = localStorage.getItem('nx_token')
  const base = import.meta.env.VITE_API_URL + '/api'
  const h     = { Authorization: `Bearer ${token}` }
*/
const token = localStorage.getItem('nx_token')
const base  = import.meta.env.VITE_API_URL 
const h     = { Authorization: `Bearer ${token}` }
  // Load students / suggestions / requests based on tab
  /*
  useEffect(() => {
    setLoading(true)

    if (tab === 'find') {
      const sp  = skill !== 'All' ? `?skill=${skill}` : ''
      const url = scope === 'global' ? `${base}/users/all${sp}` : `${base}/users${sp}`
      axios.get(url, { headers: h })
        .then(r => setUsers(Array.isArray(r.data) ? r.data : []))
        .catch(() => show('❌ Could not load students'))
        .finally(() => setLoading(false))
    }

    if (tab === 'suggestions') {
      axios.get(`${base}/users/suggestions`, { headers: h })
        .then(r => setSuggests(Array.isArray(r.data) ? r.data : []))
        .catch(() => show('❌ Could not load suggestions'))
        .finally(() => setLoading(false))
    }

    if (tab === 'requests') {
      axios.get(`${base}/users/requests`, { headers: h })
        .then(r => setReqs(Array.isArray(r.data) ? r.data : []))
        .catch(() => show('❌ Could not load requests'))
        .finally(() => setLoading(false))
    }
  }, [tab, skill, scope])
*/



useEffect(() => {
  const controller = new AbortController()
  setLoading(true)

  let request

if (tab === 'find') {
  const sp = new URLSearchParams()
  if (skill !== 'All') sp.set('skill', skill)
  sp.set('page', page)

  const url = scope === 'global'
    ? `${base}/users/all?${sp}`
    : `${base}/users?${sp}`

  const isFirstPage = page === 1
  if (isFirstPage) setLoading(true)
  else setLoadingMore(true)

  axios.get(url, { headers: h })
.then(r => {
  const data = Array.isArray(r.data) ? r.data : []

  if (data.length < 20) setHasMore(false)

  setUsers(prev => isFirstPage ? data : [...prev, ...data])

  if (!isFirstPage) {
    setTimeout(() => {
      window.scrollBy({
        top: 300,
        behavior: 'smooth'
      })
    }, 50)
  }
})
    .catch(() => show('❌ Could not load students'))
    .finally(() => { setLoading(false); setLoadingMore(false) })
}

  if (tab === 'suggestions') {
    request = axios.get(`${base}/users/suggestions`, {
      headers: h,
      signal: controller.signal
    }).then(r => setSuggests(Array.isArray(r.data) ? r.data : []))
  }

  if (tab === 'requests') {
    request = axios.get(`${base}/users/requests`, {
      headers: h,
      signal: controller.signal
    }).then(r => setReqs(Array.isArray(r.data) ? r.data : []))
  }

  request
    ?.catch(err => {
      if (err.name !== 'CanceledError') {
        show('❌ Could not load data')
      }
    })
    .finally(() => setLoading(false))

  return () => controller.abort()
 }, [tab, skill, scope, page,search , searchDebounced])

useEffect(() => {
  if (tab !== 'find') return

  setPage(1)
  setHasMore(true)
  setUsers([])
}, [tab, skill, scope ,  search,searchDebounced])



useEffect(() => {
  const t = setTimeout(() => setSearchDebounced(search), 300)
  return () => clearTimeout(t)
}, [search])




// Load request count on mount so badge shows immediately
useEffect(() => {
  axios.get(`${base}/users/requests`, { headers: h })
    .then(r => setReqs(Array.isArray(r.data) ? r.data : []))
    .catch(() => {})
}, [])  // runs once on mount





  // Search filter
const filtered = users.filter(u => {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return (
    u.name?.toLowerCase().includes(q)     ||
    u.username?.toLowerCase().includes(q) ||  // ← ADD
    u.branch?.toLowerCase().includes(q)   ||
    u.year?.toLowerCase().includes(q)     ||
    (u.skills || []).some(s => s.toLowerCase().includes(q))
  )
})


  async function handleFollow(u) {
    if (sentIds.includes(u._id.toString()) || u.isFollowing) return
    try {
      await axios.post(`${base}/users/${u._id}/connect`, {}, { headers: h })
      setSentIds(p => [...p, u._id.toString()])
      show(`✅ Follow request sent to ${u.name.split(' ')[0]}!`)
      

      refreshUser()
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Failed'))
    }
  }

  async function handleAccept(u) {
    try {
      await axios.post(`${base}/users/${u._id}/accept`, {}, { headers: h })
      setReqs(p => p.filter(r => r._id !== u._id))
      show(`✅ Now following ${u.name.split(' ')[0]}!`)
      refreshUser()
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Failed'))
    }
  }

  async function handleReject(u) {
    try {
      await axios.post(`${base}/users/${u._id}/reject`, {}, { headers: h })
      setReqs(p => p.filter(r => r._id !== u._id))
      show('Request removed')
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Failed'))
    }
  }

  return (
    <div className="page-wrap">

      {/* Sticky header */}
      <div className="connect-sticky">
        <div className="connect-top">
          <h1 className="conn-title">
            {tab === 'find'        ? 'Find People 🔍' :
             tab === 'suggestions' ? 'Suggested 💡'   :
             'Requests 🤝'}
          </h1>

          {/* 3 tabs */}
          <div className="view-toggle">
            <button className={tab === 'find'        ? 'on' : ''} onClick={() => setTab('find')}>Find</button>
            <button className={tab === 'suggestions' ? 'on' : ''} onClick={() => setTab('suggestions')}>
              Suggested
            </button>
            <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              Requests
              {requests.length > 0 && tab !== 'requests' && (
                <span className="req-badge">{requests.length}</span>
              )}
            </button>
          </div>
        </div>

        {/* Find tab controls */}
        {tab === 'find' && (
          <>

           

            {/* Search */}
            <div className="conn-search-box">
              <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} width={14} height={14}>
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text"
                placeholder="Search by name or skill…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoComplete="off"
              />
              {search && <button className="srch-x" onClick={() => setSearch('')}>✕</button>}
            </div>





            {/* Skill pills */}
       {/* Scope + Skill pills in one scrollable row */}
<div className="skill-filter-row">

  {/* Scope dropdown */}
  <div className="scope-select-wrap" style={{ flexShrink:0 }}>
    <select
      className="scope-select"
      value={scope}
      onChange={e => setScope(e.target.value)}
    >
      <option value="college">🏫 My College</option>
      <option value="global">🌐 All</option>
    </select>
    <span className="scope-arrow">▾</span>
  </div>

  {/* Divider */}
  <div style={{ width:1, height:22, background:'var(--br2)', flexShrink:0 }} />

  {/* Skill filters */}
  {SKILL_FILTERS.map(s => (
    <button
      key={s}
      className={`sf-pill ${skill === s ? 'on' : ''}`}
      onClick={() => setSkill(s)}
    >
      {s}
    </button>
  ))}

</div>
          </>
        )}
      </div>

      {/* ── FIND TAB ── */}
      {tab === 'find' && (
        <div className="people-list">
          {loading && <div className="list-loading">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="conn-empty">
              <div style={{ fontSize:'2.2rem' }}>🔍</div>
              <h3>No students found</h3>
              <p>{users.length === 0 ? 'No students from this college yet' : 'Try a different search'}</p>
            </div>
          )}
          {!loading && filtered.map((u, i) => (
            <PersonCard
              key={u._id}
              u={u}
              index={i}
              onFollow={handleFollow}
              onView={id => nav(`/profile/${id}`)}
              sentIds={sentIds}
              isSuggestion={false}
            />
          ))}
        </div>
      )}



      {/* ── SUGGESTIONS TAB ── */}
      {tab === 'suggestions' && (
        <div className="people-list">
          {loading && <div className="list-loading">Loading suggestions…</div>}

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
            <PersonCard
              key={u._id}
              u={u}
              index={i}
              onFollow={handleFollow}
              onView={id => nav(`/profile/${id}`)}
              sentIds={sentIds}
              isSuggestion={true}
            />
          ))}
        </div>
      )}

      {/* Load more */}
{tab === 'find' && !loading && hasMore && (
  <div style={{ padding:'12px 14px' }}>
    <button
      onClick={() => setPage(p => p + 1)}
      disabled={loadingMore}
      style={{
        width:'100%', padding:'12px',
        background:'var(--bg2)',
        border:'1.5px solid var(--br2)',
        borderRadius:12,
        color:'var(--muted)',
        fontFamily:'Outfit,sans-serif',
        fontSize:'.8rem', fontWeight:700,
        cursor: loadingMore ? 'not-allowed' : 'pointer'
      }}
    >
      {loadingMore ? 'Loading…' : 'Load More Students'}
    </button>
  </div>
)}
{tab === 'find' && !loading && !hasMore && users.length > 0 && (
  <div style={{
    textAlign:'center', padding:'16px',
    color:'var(--dim)', fontSize:'.72rem'
  }}>
    All students loaded ✓
  </div>
)}
      {/* ── REQUESTS TAB ── */}
      {tab === 'requests' && (
        <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {loading && <div className="list-loading">Loading…</div>}

          {!loading && requests.length === 0 && (
            <div className="conn-empty">
              <div style={{ fontSize:'2.2rem' }}>📭</div>
              <h3>No pending requests</h3>
              <p>When someone wants to follow you, it appears here</p>
            </div>
          )}

          {!loading && requests.map((u, i) => {
            if (!u?._id) return null
            return (
              <div
                key={u._id}
                className="request-card"
                onClick={() => nav(`/profile/${u._id}`)}
                style={{ cursor:'pointer' }}
              >
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

                <div
                  style={{ display:'flex', flexDirection:'column', gap:6 }}
                  onClick={e => e.stopPropagation()}
                >
                  <button className="req-accept-btn" onClick={() => handleAccept(u)}>✓ Accept</button>
                  <button className="req-reject-btn" onClick={() => handleReject(u)}>Reject</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height:14 }} />
      <Toast msg={msg} onClose={clear} />
    </div>
  )
}