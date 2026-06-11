
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Admin() {
  const { user } = useAuth()
  const nav      = useNavigate()

  const [stats,      setStats]     = useState(null)
  const [reports,    setReports]   = useState([])
  const [loading,    setLoading]   = useState(true)
  const [tab,        setTab]       = useState('stats')
  const [adminKey,   setAdminKey]  = useState(sessionStorage.getItem('admin_key') || '')
  const [keyEntered, setKeyEntered]= useState(!!sessionStorage.getItem('admin_key'))

  const token       = localStorage.getItem('nx_token')
  const base        = import.meta.env.VITE_API_URL
  const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL

  // ── ALL hooks BEFORE any conditional return ──
  useEffect(() => {
    if (!keyEntered) return          // guard INSIDE useEffect — fine
    if (!user) return
    if (user.email !== ADMIN_EMAIL) { nav('/home'); return }

    const h = {
      Authorization: `Bearer ${token}`,
      'x-admin-key': adminKey
    }
const getH = () => ({
  Authorization: `Bearer ${token}`,
  'x-admin-key': adminKey
})
    Promise.all([
       axios.get(`${base}/posts/admin/stats`, { headers: h }),
       axios.get(`${base}/posts/admin/reports`, { headers: h }),
    ])
      .then(([s, r]) => {
        setStats(s.data)
        setReports(r.data || [])
      })
      .catch(() => nav('/home'))
      .finally(() => setLoading(false))
  }, [user, keyEntered])   // ← add keyEntered as dep

  // ── conditional returns AFTER all hooks ──
  if (!keyEntered) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center',
      justifyContent:'center', minHeight:'100vh', background:'#0d0d0d',
      gap:12, padding:24 }}>
      <div style={{ fontFamily:'Fraunces,serif', fontSize:'1.3rem',
        fontWeight:800, color:'#f0f0f0' }}>🛡️ Admin Access</div>
      <input
        type="password"
        placeholder="Enter admin key"
        value={adminKey}
        onChange={e => setAdminKey(e.target.value)}
        style={{ width:'100%', maxWidth:300, height:46, background:'#141414',
          border:'1.5px solid #2a2a2a', borderRadius:12, padding:'0 14px',
          color:'#f0f0f0', fontFamily:'Outfit,sans-serif', fontSize:'.9rem',
          outline:'none' }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            sessionStorage.setItem('admin_key', adminKey)
            setKeyEntered(true)
          }
        }}
      />
      <button
        onClick={() => {
          sessionStorage.setItem('admin_key', adminKey)
          setKeyEntered(true)
        }}
        style={{ padding:'10px 28px', background:'#a73333', border:'none',
          borderRadius:12, color:'white', fontWeight:700, cursor:'pointer',
          fontFamily:'Outfit,sans-serif' }}>
        Enter
      </button>
    </div>
  )

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'#0d0d0d', color:'#666' }}>
      Loading…
    </div>
  )
const deletePost = async (postId, reportId) => {
  console.log('Delete clicked', postId, reportId)

  try {
    await axios.delete(
      `${base}/posts/admin/post/${postId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-admin-key': adminKey
        }
      }
    )

    setReports(prev =>
      prev.filter(r => r._id !== reportId)
    )
  } catch (err) {
    console.error(err)
    alert('Delete failed')
  }
}
  // ... rest of your JSX stays exactly the same
  return (
    <div style={{ maxWidth:430, margin:'0 auto', background:'#0d0d0d',
      minHeight:'100vh', padding:'0 0 40px' }}>

      {/* Header */}
      <div style={{ padding:'16px 16px 0', borderBottom:'1px solid #1f1f1f',
        paddingBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center',
          justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <div style={{ fontFamily:'Fraunces,serif', fontSize:'1.3rem',
              fontWeight:800, color:'#f0f0f0' }}>
              🛡️ Admin
            </div>
            <div style={{ fontSize:'.68rem', color:'#555', marginTop:2 }}>
              MeetNet Control Panel
            </div>
          </div>
          <button onClick={() => nav('/home')}
            style={{ background:'#1a1a1a', border:'1px solid #2a2a2a',
              borderRadius:9, padding:'6px 12px', color:'#888',
              fontSize:'.72rem', fontWeight:700, cursor:'pointer',
              fontFamily:'Outfit,sans-serif' }}>
            ← Back
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', background:'#141414',
          borderRadius:10, padding:3, gap:3 }}>
          {[['stats','📊 Stats'], ['reports',`🚩 Reports${reports.length > 0 ? ` (${reports.length})` : ''}`]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                flex:1, padding:'7px', borderRadius:8, border:'none',
                background: tab === id ? '#a73333' : 'transparent',
                color: tab === id ? 'white' : '#666',
                fontWeight:700, fontSize:'.75rem', cursor:'pointer',
                fontFamily:'Outfit,sans-serif', transition:'all .2s'
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── STATS TAB ── */}
      {tab === 'stats' && stats && (
        <div style={{ padding:'16px' }}>

          {/* Main numbers */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr',
            gap:10, marginBottom:14 }}>
            {[
              { label:'Total Users',  value: stats.totalUsers,  icon:'👥', color:'#3b82f6' },
              { label:'Total Posts',  value: stats.totalPosts,  icon:'📝', color:'#22c55e' },
              { label:'Users Today',  value: stats.usersToday,  icon:'🆕', color:'#a855f7' },
              { label:'Posts Today',  value: stats.postsToday,  icon:'🔥', color:'#f97316' },
              { label:'Users (7d)',   value: stats.usersThisWeek, icon:'📈', color:'#f59e0b' },
              { label:'Posts (7d)',   value: stats.postsThisWeek, icon:'💬', color:'#06b6d4' },
            ].map(({ label, value, icon, color }) => (
              <div key={label} style={{
                background:'#141414', border:'1px solid #1f1f1f',
                borderRadius:14, padding:'14px 12px',
                display:'flex', flexDirection:'column', gap:4
              }}>
                <div style={{ fontSize:'1.4rem' }}>{icon}</div>
                <div style={{ fontFamily:'Fraunces,serif', fontSize:'1.6rem',
                  fontWeight:800, color, lineHeight:1 }}>
                  {value?.toLocaleString() ?? '—'}
                </div>
                <div style={{ fontSize:'.65rem', color:'#555', fontWeight:600 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Pending reports warning */}
          {stats.pendingReports > 0 && (
            <div onClick={() => setTab('reports')}
              style={{
                background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)',
                borderRadius:12, padding:'12px 14px', marginBottom:14,
                display:'flex', alignItems:'center', gap:10, cursor:'pointer'
              }}>
              <div style={{ fontSize:'1.3rem' }}>🚩</div>
              <div>
                <div style={{ fontSize:'.82rem', fontWeight:700, color:'#ef4444' }}>
                  {stats.pendingReports} pending report{stats.pendingReports > 1 ? 's' : ''}
                </div>
                <div style={{ fontSize:'.68rem', color:'#888', marginTop:2 }}>
                  Tap to review →
                </div>
              </div>
            </div>
          )}

          {/* Top colleges */}
          {stats.topColleges?.length > 0 && (
            <div style={{ background:'#141414', border:'1px solid #1f1f1f',
              borderRadius:14, padding:'14px', marginBottom:14 }}>
              <div style={{ fontSize:'.72rem', fontWeight:700, color:'#555',
                marginBottom:12, textTransform:'uppercase', letterSpacing:'.05em' }}>
                Top Colleges
              </div>
              {stats.topColleges.map((c, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center',
                  gap:10, marginBottom:10 }}>
                  <div style={{ fontSize:'.75rem', color:'#555',
                    fontWeight:700, width:16 }}>
                    {i + 1}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:'.78rem', color:'#ccc',
                      fontWeight:600, marginBottom:3 }}>
                      {c.college || 'Unknown'}
                    </div>
                    {/* Progress bar */}
                    <div style={{ height:4, background:'#222', borderRadius:4, overflow:'hidden' }}>
                      <div style={{
                        height:'100%', borderRadius:4,
                        background:'linear-gradient(90deg,#a73333,#f97316)',
                        width: `${Math.round((c.count / stats.totalUsers) * 100)}%`,
                        transition:'width .4s ease'
                      }}/>
                    </div>
                  </div>
                  <div style={{ fontSize:'.75rem', color:'#888',
                    fontWeight:700, flexShrink:0 }}>
                    {c.count} users
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Ratio */}
          <div style={{ background:'#141414', border:'1px solid #1f1f1f',
            borderRadius:14, padding:'14px' }}>
            <div style={{ fontSize:'.72rem', fontWeight:700, color:'#555',
              marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>
              Engagement
            </div>
            <div style={{ fontSize:'.82rem', color:'#aaa' }}>
              Avg posts per user:{' '}
              <strong style={{ color:'#f0f0f0' }}>
                {stats.totalUsers > 0
                  ? (stats.totalPosts / stats.totalUsers).toFixed(1)
                  : '—'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORTS TAB ── */}
      {tab === 'reports' && (
        <div style={{ padding:'16px' }}>
          {reports.length === 0 && (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'#555' }}>
              <div style={{ fontSize:'2.5rem', marginBottom:12 }}>✅</div>
              <div style={{ fontWeight:700, color:'#888' }}>No pending reports</div>
            </div>
          )}

          {reports.map(r => (
            <div key={r._id} style={{
              background:'#141414', border:'1px solid #1f1f1f',
              borderRadius:14, padding:14, marginBottom:12
            }}>
              {/* Report info */}
              <div style={{ display:'flex', alignItems:'center', gap:8,
                marginBottom:10 }}>
                <span style={{ fontSize:'.65rem', fontWeight:700,
                  background:'rgba(239,68,68,.15)', color:'#ef4444',
                  padding:'3px 8px', borderRadius:6 }}>
                  {r.reason}
                </span>
                <span style={{ fontSize:'.63rem', color:'#555' }}>
                  by {r.reportedBy?.name} · {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Post preview */}
              <div style={{ background:'#0d0d0d', borderRadius:10,
                padding:'10px 12px', marginBottom:10 }}>
                <div style={{ fontSize:'.62rem', color:'#444',
                  marginBottom:5, textTransform:'uppercase', letterSpacing:'.04em' }}>
                  {r.post?.type} · {r.post?.college}
                </div>
                <p style={{ fontSize:'.8rem', color:'#bbb', margin:0,
                  lineHeight:1.6, wordBreak:'break-word' }}>
                  {r.post?.text}
                </p>
                {r.post?.imageUrl && (
                  <img src={r.post.imageUrl} alt="post"
                    style={{ width:'100%', borderRadius:8, marginTop:8,
                      maxHeight:180, objectFit:'cover' }} />
                )}
              </div>

              {/* Action buttons */}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => deletePost(r.post?._id, r._id)}
                  style={{
                    flex:1, padding:'9px', borderRadius:9, border:'none',
                    background:'#ef4444', color:'white', fontWeight:700,
                    fontSize:'.75rem', cursor:'pointer',
                    fontFamily:'Outfit,sans-serif', transition:'all .2s'
                  }}>
                  🗑️ Delete Post
                </button>
                <button onClick={() => dismiss(r._id)}
                  style={{
                    flex:1, padding:'9px', borderRadius:9,
                    border:'1px solid #2a2a2a', background:'transparent',
                    color:'#666', fontWeight:700, fontSize:'.75rem',
                    cursor:'pointer', fontFamily:'Outfit,sans-serif'
                  }}>
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
