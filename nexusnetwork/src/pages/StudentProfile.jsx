

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { connectUser, unfollowUser, addReply, deleteReply } from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'

const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  partner:    { label:'🤝 Partner',    cls:'tag-green'  },
  project:    { label:'🚀 Project',    cls:'tag-yellow' },
  tip:        { label:'💡 Tip',        cls:'tag-orange' },
  social:     { label:'🔥 Social',     cls:'tag-orange' },
  confession: { label:'🤫 Confession', cls:'tag-red'    },
}

const AV_COLORS = [
  { bg:'rgba(59,130,246,.15)', color:'#3b82f6' },
  { bg:'rgba(168,85,247,.15)', color:'#a855f7' },
  { bg:'rgba(255,59,92,.12)',  color:'#ff3b5c' },
  { bg:'rgba(34,197,94,.14)',  color:'#22c55e' },
  { bg:'rgba(245,158,11,.14)', color:'#f59e0b' },
]

// ── Media helpers ─────────────────────────────────
function getYouTubeId(url) {
  if (!url) return null
  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
    /youtube\.com\/shorts\/([^?\s]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }
  return null
}



function getInstagramUsername(url) {
  if (!url) return null

  try {
    const clean = url.split('?')[0].replace(/\/+$/, '') // remove query + trailing slash
    const parts = clean.split('/')

    const username = parts[parts.length - 1]

    // block invalid paths
    if (!username || ['p','reel','tv','explore','accounts'].includes(username)) {
      return null
    }

    return username

  } catch {
    return null
  }
}


function isInstagramProfile(url) {
  return !!getInstagramUsername(url)
}



function getInstagramId(url) {
  if (!url) return null
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?]+)/)
  return m?.[1] || null
}

function isShort(url) {
  return url?.includes('/shorts/')
}

function av(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(d) {
  const days = Math.floor((Date.now() - new Date(d)) / 86400000)
  if (days === 0) return 'today'
  if (days < 7)  return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

// ── Single media card — iframe only loads on tap ──
function MediaCard({ item }) {
  const [playing, setPlaying] = useState(false)

  if (item.type === 'youtube') {
    const ytId  = getYouTubeId(item.url)
    const short = isShort(item.url)
    if (!ytId) return null
    return (
      <div
        className={`media-card ${short ? 'media-short' : 'media-video'}`}
        onClick={() => setPlaying(true)}
      >
        {playing ? (
          <div className="media-player-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              title="YouTube"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width:'100%', height:'100%', border:'none', display:'block' }}
            />
          </div>
        ) : (
          <>
            <img
              src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
              alt="thumbnail"
              className="media-thumb"
              loading="lazy"
            />
            <div className="media-play-overlay">
              <div className="media-play-btn">▶</div>
            </div>
            <div className="media-type-badge yt-badge">▶ YT</div>
            {short && <div className="media-short-badge">Short</div>}
          </>
        )}
      </div>
    )
  }

 if (item.type === 'instagram') {
  const username = getInstagramUsername(item.url)
  if (!username) return null

  return (
    <div className="ig-profile-card">

      <div className="ig-profile-left">
        <div className="ig-profile-icon">📸</div>

        <div>
          <div className="ig-profile-name">@{username}</div>
          <div className="ig-profile-sub">Instagram</div>
        </div>
      </div>

      <a
        href={`https://instagram.com/${username}`}
        target="_blank"
        rel="noreferrer"
        className="ig-visit-btn"
        onClick={(e) => e.stopPropagation()}
      >
        Visit ↗
      </a>

    </div>
  )
}

  return null
}

// ── Media section (read-only, no add/remove) ──────
function MediaSection({ mediaItems }) {
  if (!mediaItems?.length) {
    return (
      <div className="conn-empty" style={{ padding:'28px 20px' }}>
        <div style={{ fontSize:'2rem' }}>🎬</div>
        <h3>No media yet</h3>
        <p>This student hasn't added any videos yet</p>
      </div>
    )
  }

  const ytItems = mediaItems.filter(m => m.type === 'youtube')
  const igItems = mediaItems.filter(m => m.type === 'instagram')

  return (
    <div style={{ padding:'14px' }}>
      {ytItems.length > 0 && (
        <>
          <div className="media-section-label">YouTube</div>
          <div className="media-grid">
            {ytItems.map((item, i) => <MediaCard key={i} item={item} />)}
          </div>
        </>
      )}
      {igItems.length > 0 && (
        <>
          <div className="media-section-label"
            style={{ marginTop: ytItems.length > 0 ? 18 : 0 }}>
            Instagram
          </div>
          <div className="media-grid">
            {igItems.map((item, i) => <MediaCard key={i} item={item} />)}
          </div>
        </>
      )}
    </div>
  )
}

// ── People bottom sheet ───────────────────────────
function PeopleSheet({ title, people, onClose, onView }) {
  return (
    <div className="people-sheet-overlay" onClick={onClose}>
      <div className="people-sheet" onClick={e => e.stopPropagation()}>
        <div className="people-sheet-header">
          <span>{title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="people-sheet-list">
          {people.length === 0 && (
            <p className="empty-hint" style={{ textAlign:'center', padding:'20px' }}>
              {title === 'Following' ? 'Not following anyone' : 'No followers yet'}
            </p>
          )}
          {people.map((u, i) => {
            const col = AV_COLORS[i % AV_COLORS.length]
            return (
              <div key={u._id} className="person-card"
                onClick={() => { onClose(); onView(u._id) }}
                style={{ cursor:'pointer' }}>
                {u.avatar
                  ? <img src={u.avatar} alt={u.name} loading="lazy"
                      style={{ width:48, height:48, borderRadius:'50%',
                        objectFit:'cover', flexShrink:0 }} />
                  : <div className="av-md"
                      style={{ background:col.bg, color:col.color, flexShrink:0 }}>
                      {av(u.name)}
                    </div>
                }
                <div className="person-info">
                  <div className="person-name">{u.name}</div>
                  <div className="person-role">{u.year} yr {u.branch} · {u.college}</div>
                  <div className="person-skills">
                    {(u.skills || []).slice(0, 3).map(s => (
                      <span key={s} className="skill-tag">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}




function StudentPostCard({ post, currentUserId }) {
  const [replies,  setReplies] = useState(post.replies || [])
  const [showR,    setShowR]   = useState(false)
  const [showBox,  setShowBox] = useState(false)
  const [rt,       setRt]      = useState('')
  const [sub,      setSub]     = useState(false)

  const TYPE_TAG_LOCAL = {
    placement:  { label:'💼 Placement',  cls:'tag-blue'   },
    qa:         { label:'❓ Q&A',         cls:'tag-purple' },
    partner:    { label:'🤝 Partner',    cls:'tag-green'  },
    project:    { label:'🚀 Project',    cls:'tag-yellow' },
    tip:        { label:'💡 Tip',        cls:'tag-orange' },
    social:     { label:'🔥 Social',     cls:'tag-orange' },
    confession: { label:'🤫 Confession', cls:'tag-red'    },
  }
  const t = TYPE_TAG_LOCAL[post.type] || { label: post.type, cls:'tag-dim' }

  const hasExpiry = !!post.expiresAt
  const hoursLeft = hasExpiry
    ? Math.max(0, Math.ceil((new Date(post.expiresAt) - Date.now()) / 3600000))
    : null

  function ago(d) {
    const days = Math.floor((Date.now() - new Date(d)) / 86400000)
    if (days === 0) return 'today'
    if (days < 7)  return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
  }
  function initials(name) {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  async function submitReply() {
    if (!rt.trim()) return
    setSub(true)
    try {
      const res = await addReply(post._id, rt.trim())
      setReplies(p => [...p, res.data])
      setRt(''); setShowBox(false); setShowR(true)
    } catch (e) { alert(e.response?.data?.message || 'Failed') }
    finally { setSub(false) }
  }

  async function removeReply(rid) {
    try {
      await deleteReply(post._id, rid)
      setReplies(p => p.filter(r => r._id !== rid))
    } catch { alert('Could not delete') }
  }

  return (
    <div className="mini-post">
      {/* Header */}
      <div className="mp-header">
        <span className={`tag ${t.cls}`} style={{ fontSize:'.6rem' }}>{t.label}</span>
        <span className="mp-time">{ago(post.createdAt)}</span>
        {hasExpiry && hoursLeft !== null && (
          <span style={{
            marginLeft:'auto', fontSize:'.6rem', color:'var(--orange)',
            fontWeight:700, background:'rgba(249,115,22,.1)',
            padding:'2px 7px', borderRadius:6
          }}>
            ⏳ {hoursLeft}h left
          </span>
        )}
      </div>

      {/* Image */}
      {post.imageUrl?.length > 0 && (
        <img src={post.imageUrl} alt="post" loading="lazy"
          style={{ width:'100%', aspectRatio:'16/9', objectFit:'cover',
            marginTop:8, borderRadius:10, display:'block' }} />
      )}

      {/* Text */}
      <p className="mp-text" style={{ padding:'8px 12px 0', whiteSpace:'pre-wrap' }}>
        {post.text}
      </p>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'6px 12px 0' }}>
          {post.tags.map(tg => <span key={tg} className="post-tag">#{tg}</span>)}
        </div>
      )}

      {/* Link — was missing */}
      {post.link?.length > 0 && (
        <a
          className="pc-link"
          href={post.link.startsWith('http') ? post.link : `https://${post.link}`}
          target="_blank"
          rel="noreferrer"
          style={{ display:'block', padding:'4px 12px 0' }}
        >
          🔗 {post.link}
        </a>
      )}

      {/* Footer — like count + reply button */}
      <div className="mp-footer" style={{ gap:7, paddingTop:8, alignItems:'center' }}>
        <span style={{ fontSize:'.72rem', color:'var(--dim)' }}>
          ❤️ {post.likes?.length || 0}
        </span>
        <button className="mp-action-btn" onClick={() => setShowBox(b => !b)}>
          {post.type === 'qa' ? '✍️ Answer' : '💬 Reply'}
        </button>
        {replies.length > 0 && (
          <button className="mp-action-btn" onClick={() => setShowR(b => !b)}
            style={{ color:'var(--accent)' }}>
            {showR ? '▲ Hide' : `▼ ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
          </button>
        )}
      </div>

      {/* Reply input box */}
      {showBox && (
        <div className="profile-reply-box">
          <textarea className="profile-reply-input" autoFocus
            placeholder={post.type === 'qa' ? 'Write your answer…' : 'Write a reply…'}
            value={rt} onChange={e => setRt(e.target.value)} maxLength={500} />
          <div className="profile-reply-footer">
            <span style={{ fontSize:'.65rem', color:'var(--dim)' }}>{rt.length}/500</span>
            <div style={{ display:'flex', gap:7 }}>
              <button className="reply-cancel"
                onClick={() => { setShowBox(false); setRt('') }}>Cancel</button>
              <button className="reply-submit" onClick={submitReply} disabled={sub || !rt.trim()}>
                {sub ? '…' : post.type === 'qa' ? 'Answer' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replies list */}
      {showR && replies.length > 0 && (
        <div className="replies-list">
          {replies.map(r => {
            const isOwn = r.postedBy?._id === currentUserId ||
                          r.postedBy?._id?.toString() === currentUserId
            return (
              <div key={r._id} className="reply-item">
                <div className="reply-av"
                  style={{ background:'rgba(59,130,246,.15)', color:'#3b82f6', overflow:'hidden' }}>
                  {r.postedBy?.avatar
                    ? <img src={r.postedBy.avatar} alt="" loading="lazy"
                        style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
                    : initials(r.postedBy?.name)
                  }
                </div>
                <div className="reply-content">
                  <div className="reply-header">
                    <span className="reply-name">{r.postedBy?.name || 'User'}</span>
                    <span className="reply-meta">{r.postedBy?.year} yr · {ago(r.createdAt)}</span>
                    {isOwn && (
                      <button className="reply-delete" onClick={() => removeReply(r._id)}>🗑️</button>
                    )}
                  </div>
                  <p className="reply-text">{r.text}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}


// ── Main StudentProfile ───────────────────────────
export default function StudentProfile() {
  const { id }               = useParams()
  const { user, refreshUser }= useAuth()
  const nav                  = useNavigate()
  const { msg, show, clear } = useToast()

  const [profile,   setProfile]  = useState(null)
  const [posts,     setPosts]    = useState([])
  const [following, setFollowing]= useState([])
  const [followers, setFollowers]= useState([])
  const [tab,       setTab]      = useState('posts')
  const [loading,   setLoading]  = useState(true)
  const [btnBusy,   setBtnBusy]  = useState(false)
  const [sheet,     setSheet]    = useState(null) // 'following' | 'followers' | null

  // Redirect if own profile — before render
  const myId = user?._id?.toString()
  if (myId && myId === id) {
    nav('/profile', { replace: true })
    return null
  }

  function getStatus() {
    if (!user) return 'none'
    const myFollowing = (user.following || []).map(c =>
      c?._id?.toString() || c?.toString() || ''
    )
    if (myFollowing.includes(id)) return 'following'
    const mySent = (user.sentRequests || []).map(c =>
      c?._id?.toString() || c?.toString() || ''
    )
    if (mySent.includes(id)) return 'sent'
    return 'none'
  }

  /*
  useEffect(() => {
    const token = localStorage.getItem('nx_token')
    const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
    const h     = { Authorization: `Bearer ${token}` }

    setLoading(true)
    Promise.all([
      axios.get(`${base}/users/${id}`,           { headers: h }),
      axios.get(`${base}/users/${id}/posts`,      { headers: h }).catch(() => ({ data: [] })),
      axios.get(`${base}/users/${id}/following`,  { headers: h }).catch(() => ({ data: [] })),
      axios.get(`${base}/users/${id}/followers`,  { headers: h }).catch(() => ({ data: [] })),
    ])
      .then(([p, po, fw, fb]) => {
        setProfile(p.data)
        setPosts(po.data   || [])
        setFollowing(fw.data || [])
        setFollowers(fb.data || [])
      })
      .catch(() => { show('❌ Profile not found'); nav('/connect') })
      .finally(() => setLoading(false))
  }, [id])
*/


useEffect(() => {
  const token = localStorage.getItem('nx_token')
  const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
  const h     = { Authorization: `Bearer ${token}` }

  setLoading(true)

  // 1️⃣ Load profile first (important)
  axios.get(`${base}/users/${id}`, { headers: h })
    .then(r => setProfile(r.data))
    .catch(() => {
      show('❌ Profile not found')
      nav('/connect')
    })
    .finally(() => setLoading(false))

  // 2️⃣ Load posts separately (non-blocking)
//  axios.get(`${base}/users/${id}/posts`, { headers: h })
  axios.get(`${base}/users/${id}/posts?page=1&limit=10`, { headers: h })
    .then(r => setPosts(r.data || []))

}, [id])


  async function handleFollow() {
    setBtnBusy(true)
    try {
      await connectUser(id)
      await refreshUser()
      show('✅ Follow request sent!')
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Failed'))
    } finally { setBtnBusy(false) }
  }

  async function handleUnfollow() {
    setBtnBusy(true)
    try {
      await unfollowUser(id)
      await refreshUser()
      setProfile(p => p ? {
        ...p, followerCount: Math.max((p.followerCount || 1) - 1, 0)
      } : p)
      setFollowers(p => p.filter(u => u._id !== user?._id))
      show('you Disconnected')
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Failed'))
    } finally { setBtnBusy(false) }
  }

  if (!user || loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:'100vh', background:'var(--bg)', color:'var(--dim)' }}>
      Loading…
    </div>
  )

  if (!profile) return null

  const status     = getStatus()
  const mediaItems = profile.mediaItems || []
  const mediaCount = mediaItems.length

  return (
    <div className="page-wrap">

      {/* Back */}
      <div style={{ padding:'10px 14px 0' }}>
        <button className="back-btn" onClick={() => nav(-1)}>← Back</button>
      </div>

      {/* Cover */}
      <div className="prof-cover-wrap" style={{ marginTop:10 }}>
        {profile.coverImage
          ? <img src={profile.coverImage} alt="cover" className="prof-cover-img" loading="lazy" />
          : <div className="prof-cover" />
        }
      </div>

      {/* Avatar + Follow button */}
      <div className="prof-top-row" style={{ marginTop:-36, position:'relative', zIndex:2 }}>
        <div className="prof-av-wrap">
          {profile.avatar
            ? <img src={`${profile.avatar}?f_auto&q_auto&w=200`} alt={profile.name} className="prof-av-img"
                style={{ border:'3px solid var(--bg)', borderRadius:18 }} />
            : <div className="prof-av" style={{ border:'3px solid var(--bg)' }}>
                {av(profile.name)}
              </div>
          }
        </div>
        <div className="prof-action-btns">
          {status === 'following' && (
            <button className="disconnect-btn" onClick={handleUnfollow} disabled={btnBusy}>
              {btnBusy ? '…' : '✓ Following · Unfollow'}
            </button>
          )}
          {status === 'sent' && (
            <button className="connect-btn pending"
              style={{ padding:'8px 16px', cursor:'default' }}>⏳ Request Sent</button>
          )}
          {status === 'none' && (
            <button className="pab-save" onClick={handleFollow}
              disabled={btnBusy} style={{ padding:'8px 18px' }}>
              {btnBusy ? '…' : '+ Connect'}
            </button>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="prof-info">
        <h2 className="prof-name">{profile.name}</h2>
        <p className="prof-handle">{profile.year} yr {profile.branch} · {profile.college}</p>
        {profile.bio && (
          <p className="prof-bio" style={{ whiteSpace:'pre-wrap' }}>{profile.bio}</p>
        )}
        <div className="prof-meta-tags">
          <span className="tag tag-blue">{profile.year} year</span>
          <span className="tag tag-dim">{profile.branch}</span>
          <span className="tag tag-green">🏫 {profile.college}</span>
          {profile.year === '4th' && <span className="tag tag-yellow">🎓 Senior</span>}
        </div>
      </div>

      {/* Stats — tap Following/Followers to open bottom sheet */}
      <div className="prof-stats">
        <div className="prof-stat" style={{ cursor:'pointer' }} onClick={() => setTab('posts')}>
          <div className="ps-num">{posts.length}</div>
          <div className="ps-lbl">Posts</div>
        </div>
        <div
          className="prof-stat prof-stat-clickable"

         /*  onClick={() => following.length > 0 && setSheet('following')}*/
         onClick={async () => {
                if (following.length === 0) {
                   const token = localStorage.getItem('nx_token')
                   const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
                   const res = await axios.get(`${base}/users/${id}/following`, {
                   headers: { Authorization: `Bearer ${token}` }
                 })
            setFollowing(res.data || [])
           }
         setSheet('following')
        }}
        >
          <div className="ps-num">{profile.followingCount ?? following.length}</div>
          <div className="ps-lbl">Following {following.length > 0 ? '›' : ''}</div>
        </div>
        <div
          className="prof-stat prof-stat-clickable"
         // onClick={() => followers.length > 0 && setSheet('followers')}
         onClick={async () => {
              if (followers.length === 0) {
                  const token = localStorage.getItem('nx_token')
                  const base  = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
                  const res = await axios.get(`${base}/users/${id}/followers`, {
                  headers: { Authorization: `Bearer ${token}` }
               })
             setFollowers(res.data || [])
           }
        setSheet('followers')
       }}
        >
          <div className="ps-num">{profile.followerCount || 0}</div>
          <div className="ps-lbl">Followers {followers.length > 0 ? '›' : ''}</div>
        </div>
      </div>

      {/* Skills */}
      {(profile.skills || []).length > 0 && (
        <section className="prof-section">
          <div className="section-header"><h3 className="section-title">Skills</h3></div>
          <div className="skill-badges">
            {profile.skills.map(s => <span key={s} className="skill-badge">{s}</span>)}
          </div>
        </section>
      )}

      {/* Projects */}
      {(profile.projects || []).length > 0 && (
        <section className="prof-section">
          <div className="section-header"><h3 className="section-title">Projects</h3></div>
          {profile.projects.map((p, i) => (
            <div key={i} className="project-card">
              <div className="proj-icon-wrap">🚀</div>
              <div>
                <div className="proj-name">{p.name}</div>
                {p.link && (
                  <a href={p.link.startsWith('http') ? p.link : `https://${p.link}`}
                    target="_blank" rel="noreferrer" className="proj-link">{p.link}</a>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Roadmap — hidden */}
      {/* {profile.roadmap && ( <section>...</section> )} */}

      {/* ── Tabs: Posts | Media ── */}
      <div className="posts-tabs">
        <button className={`posts-tab ${tab === 'posts' ? 'on' : ''}`}
          onClick={() => setTab('posts')}>
          Posts ({posts.length})
        </button>
        <button className={`posts-tab ${tab === 'media' ? 'on' : ''}`}
          onClick={() => setTab('media')}>
          Media 🎬 {mediaCount > 0 ? `(${mediaCount})` : ''}
        </button>
      </div>

      {/* Posts tab */}
    {tab === 'posts' && (
  <div className="posts-grid">
    {posts.length === 0 ? (
      <p className="empty-hint" style={{ textAlign:'center', padding:'24px 0' }}>
        No public posts yet
      </p>
    ) : posts.map(p => (
      <StudentPostCard
        key={p._id}
        post={p}
        currentUserId={user?._id}
      />
    ))}
  </div>
)}

      {/* Media tab — same as own profile, no edit buttons */}
      {tab === 'media' && (
        <MediaSection mediaItems={mediaItems} />
      )}

      <div style={{ height:14 }} />

      {/* Following / Followers sheet */}
      {sheet && (
        <PeopleSheet
          title={sheet === 'following' ? 'Following' : 'Followers'}
          people={sheet === 'following' ? following : followers}
          onClose={() => setSheet(null)}
          onView={id => nav(`/profile/${id}`)}
        />
      )}

      <Toast msg={msg} onClose={clear} />
    </div>
  )
}