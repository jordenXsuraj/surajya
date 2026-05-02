
import { useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getFeed, likePost, savePost, deletePost,
  addReply, deleteReply, sendInterest, connectUser
} from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

const CATEGORIES = [
  { id:'all',        label:'All',           color:'var(--text)'   },
  { id:'placement',  label:'💼 Placement',  color:'var(--blue)'   },
  { id:'social',     label:'🔥 Social',     color:'var(--orange)' },
  { id:'confession', label:'🤫 Confession', color:'var(--accent)' },
  { id:'project',    label:'🚀 Project',    color:'var(--yellow)' },
  { id:'qa',         label:'❓ Q&A',         color:'var(--purple)' },
  { id:'partner',    label:'🤝 Partner',    color:'var(--green)'  },
]

const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  social:     { label:'🔥 Social',     cls:'tag-orange' },
  confession: { label:'🤫 Confession', cls:'tag-red'    },
  project:    { label:'🚀 Project',    cls:'tag-yellow' },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  partner:    { label:'🤝 Partner',    cls:'tag-green'  },
}

function timeAgo(d) {
  const h = Math.floor((Date.now() - new Date(d)) / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function av(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

const BEHAVIOUR_KEY = 'nx_bhv'

function getBehaviour() {
  try { return JSON.parse(localStorage.getItem(BEHAVIOUR_KEY)) || {} } catch { return {} }
}

export function trackInteraction(postType, action) {
  if (!postType) return
  try {
    const b = getBehaviour()
    if (!b[postType]) b[postType] = { like:0, reply:0, save:0 }
    b[postType][action] = (b[postType][action] || 0) + 1
    localStorage.setItem(BEHAVIOUR_KEY, JSON.stringify(b))
  } catch {}
}

function affinityScore(postType) {
  const b = getBehaviour()[postType]
  if (!b) return 0
  return Math.min(((b.reply || 0) * 3 + (b.save || 0) * 3 + (b.like || 0)) / 10, 2)
}

function scorePost(post, { currentUserId, connectionIds, nowMs }) {
  let score = 0
  const ageHours   = (nowMs - new Date(post.createdAt).getTime()) / 3600000
  const likeCount  = (post.likes   || []).length
  const replyCount = (post.replies || []).length
  const isConn     = connectionIds.includes(post.postedBy?._id?.toString())

  score += 35 * Math.exp(-ageHours / 12)
  score += Math.min((ageHours > 0 ? likeCount / ageHours : likeCount) / 4, 1) * 20
  const recentReplies = (post.replies || []).filter(r =>
    (nowMs - new Date(r.createdAt).getTime()) < 2 * 3600000
  ).length
  score += Math.min(replyCount * 1.2, 7) + Math.min(recentReplies * 2.5, 8)
  if (isConn) score += 15
  score += affinityScore(post.type) * 5
  if (post.imageUrl?.length > 0) score += 2
  if (post.link?.length > 0)     score += 1
  if (post.tags?.length > 0)     score += Math.min(post.tags.length, 2)
  if (ageHours > 72)  score -= 18
  if (ageHours > 168) score -= 25
  if (ageHours > 6 && likeCount === 0 && replyCount === 0) score -= 8

  return score
}

function smartSort(posts, currentUserId, connectionIds) {
  const nowMs = Date.now()
  return [...posts]
    .map(p => ({ p, s: scorePost(p, { currentUserId, connectionIds, nowMs }) }))
    .sort((a, b) => b.s - a.s)
    .map(x => x.p)
}

function ReplyBox({ postId, postType, onAdded, onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await addReply(postId, text.trim())
      onAdded(res.data); setText(''); onClose()
    } catch (e) { alert(e.response?.data?.message || 'Failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="reply-box">
      <textarea className="reply-input" autoFocus
        placeholder={postType === 'qa' ? 'Write your answer…' : 'Write a reply…'}
        value={text} onChange={e => setText(e.target.value)} maxLength={500}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit() }}/>
      <div className="reply-box-footer">
        <span className="reply-char">{text.length}/500</span>
        <div style={{ display:'flex', gap:7 }}>
          <button className="reply-cancel" onClick={onClose}>Cancel</button>
          <button className="reply-submit" onClick={submit} disabled={busy || !text.trim()}>
            {busy ? '…' : postType === 'qa' ? 'Answer' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReplyItem({ reply, postId, currentUserId, onDeleted }) {
  const [del, setDel] = useState(false)
  const isOwn = reply.postedBy?._id === currentUserId ||
                reply.postedBy?._id?.toString() === currentUserId

  async function handleDelete() {
    setDel(true)
    try { await deleteReply(postId, reply._id); onDeleted(reply._id) }
    catch { alert('Could not delete') }
    finally { setDel(false) }
  }

  const name = reply.postedBy?.name || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="reply-item">
      <div className="reply-av" style={{ background:'rgba(59,130,246,.15)', color:'#3b82f6', overflow:'hidden' }}>
        {reply.postedBy?.avatar
          ? <img src={reply.postedBy.avatar} alt={name} loading="lazy"
              style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
          : initials
        }
      </div>
      <div className="reply-content">
        <div className="reply-header">
          <span className="reply-name">{name}</span>
          <span className="reply-meta">{reply.postedBy?.year} yr · {timeAgo(reply.createdAt)}</span>
          {isOwn && <button className="reply-delete" onClick={handleDelete} disabled={del}>🗑️</button>}
        </div>
        <p className="reply-text">{reply.text}</p>
      </div>
    </div>
  )
}

function PostCard({ post, currentUserId, onLike, onSave, onDelete, savedIds, myConnections, mySentReqs, onConnect }) {
  const nav = useNavigate()
  const [showReplies,  setShowR]    = useState(false)
  const [showReplyBox, setReplyBox] = useState(false)
  const [replies,      setReplies]  = useState(post.replies || [])
  const [interested,   setInt]      = useState(false)
  const [connBusy,     setConnBusy] = useState(false)

  const t        = TYPE_TAG[post.type] || { label: post.type, cls:'tag-dim' }
  const liked    = (post.likes || []).map(l => l?.toString()).includes(currentUserId)
  const saved    = savedIds.includes(post._id)
  const isOwn    = post.postedBy?._id?.toString() === currentUserId
  const authorId = post.postedBy?._id?.toString()
  const isConn   = authorId && myConnections.includes(authorId)
  const reqSent  = authorId && mySentReqs.includes(authorId)
  const showConn = !isOwn && !post.isAnonymous && authorId && !isConn

  function goToProfile() {
    if (!post.isAnonymous && post.postedBy?._id) {
      const pid = post.postedBy._id.toString?.() || post.postedBy._id
      if (pid !== currentUserId) nav(`/profile/${pid}`)
    }
  }

  async function handleInterested() {
    if (interested) return
    setInt(true)
    try {
      const res = await addReply(post._id, "🙋 I'm interested in collaborating!")
      setReplies(p => [...p, res.data])
      sendInterest(post._id).catch(() => {})
      setReplyBox(true)
    } catch (e) { setInt(false); alert(e.response?.data?.message || 'Failed') }
  }

  async function handleConnect(e) {
    e.stopPropagation()
    if (isConn || reqSent || connBusy) return
    setConnBusy(true)
    try { await onConnect(authorId, post.postedBy?.name) }
    finally { setConnBusy(false) }
  }

  return (
    <article className="post-card">
      <div className="pc-head">
        <div
          className={`pc-author-wrap ${!post.isAnonymous && post.postedBy ? 'clickable' : ''}`}
          onClick={goToProfile}
        >
          {post.isAnonymous || !post.postedBy
            ? <div className="av-anon">👤</div>
            : post.postedBy.avatar
              ? <img src={post.postedBy.avatar} alt={post.postedBy.name}
                  className="pc-avatar-img" loading="lazy"/>
              : <div className="av-sm av-colored">{av(post.postedBy.name)}</div>
          }
          <div className="pc-meta">
            <div className="pc-name">
              {post.isAnonymous || !post.postedBy ? 'Anonymous' : post.postedBy.name}
            </div>
            <div className="pc-sub">
              {!post.isAnonymous && post.postedBy &&
                `${post.postedBy.year} yr ${post.postedBy.branch} · `}
              {timeAgo(post.createdAt)}
            </div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginLeft:'auto' }}>
          <span className={`tag ${t.cls}`}>{t.label}</span>
          {isOwn && <button className="post-menu-btn" onClick={() => onDelete(post._id)}>🗑️</button>}
        </div>
      </div>

      {post.expiresAt && (
        <span style={{
          fontSize:'.65rem', color:'var(--orange)', fontWeight:700,
          background:'rgba(249,115,22,.1)', padding:'2px 8px',
          borderRadius:6, display:'inline-block', marginBottom:6
        }}>
          ⏳ {Math.max(0, Math.ceil((new Date(post.expiresAt) - Date.now()) / 3600000))}h left · Today Only
        </span>
      )}

      <div className="pc-body">
        <p className="pc-text">{post.text}</p>
        {post.imageUrl && (


 <div className="pc-image-wrap">

  {/* Background blur */}
  <div
    className="pc-image-bg"
    style={{ backgroundImage: `url(${post.imageUrl})` }}
  />

  {/* Main image */}
  <img
    src={post.imageUrl}
    alt="post"
    className="pc-image-main"
  />

</div>
)}
        {post.tags?.length > 0 && (
          <div className="pc-tags">
            {post.tags.map(tg => <span key={tg} className="post-tag">#{tg}</span>)}
          </div>
        )}
        {post.link?.length > 0 && (
          <a className="pc-link"
            href={post.link.startsWith('http') ? post.link : `https://${post.link}`}
            target="_blank" rel="noreferrer">
            🔗 {post.link}
          </a>
        )}
      </div>

      <div className="pc-actions">
        <button className={`act-btn ${liked ? 'liked' : ''}`} onClick={() => onLike(post._id)}>
          ❤️ {(post.likes || []).length}
        </button>
        {post.type === 'partner' ? (
          <>
            <button className={`interested-btn ${interested ? 'on' : ''}`}
              onClick={handleInterested} disabled={interested}>
              {interested ? '🙋 Interested!' : '🙋 Interested'}
            </button>
            <button className="act-btn" onClick={() => setReplyBox(b => !b)}>
              💬 {replies.length > 0 ? replies.length : ''}
            </button>
          </>
        ) : (
          <button className="act-btn" onClick={() => setReplyBox(b => !b)}>
            {post.type === 'qa' ? '✍️ Answer' : '💬'}
            {replies.length > 0 && ` (${replies.length})`}
          </button>
        )}
        {replies.length > 0 && (
          <button className="act-btn" onClick={() => setShowR(b => !b)}>
            {showReplies ? '▲' : `▼ ${replies.length}`}
          </button>
        )}
        <div style={{ flex:1 }}/>
        {showConn && (
          <button className={`post-connect-btn ${reqSent ? 'sent' : ''}`}
            onClick={handleConnect} disabled={reqSent || connBusy}>
            {connBusy ? '…' : reqSent ? '⏳' : '🤝 Connect'}
          </button>
        )}
        <button className={`act-btn ${saved ? 'saved' : ''}`} onClick={() => onSave(post._id)}>🔖</button>
      </div>

      {showReplyBox && (
        <ReplyBox postId={post._id} postType={post.type}
          onAdded={r => { setReplies(p => [...p, r]); setShowR(true) }}
          onClose={() => setReplyBox(false)}/>
      )}
      {showReplies && replies.length > 0 && (
        <div className="replies-list">
          {replies.map(r => (
            <ReplyItem key={r._id} reply={r} postId={post._id}
              currentUserId={currentUserId}
              onDeleted={rid => setReplies(p => p.filter(x => x._id !== rid))}/>
          ))}
        </div>
      )}
    </article>
  )
}




// ── Home Page ─────────────────────────────────────
export default function Home() {
  const { user, refreshUser } = useAuth()
  const { msg, show, clear }  = useToast()
const location = useLocation()
  const [posts,    setPosts]   = useState([])
  const [category, setCat]     = useState('all')
  const [scope,    setScope]   = useState('college')
  const [search,   setSearch]  = useState('')
  const [loading,  setLoading] = useState(true)
  const [savedIds, setSaved]   = useState([])
const [refreshKey, setRefreshKey] = useState(0)


  // ── Pagination state ─────────────────────────────
  const [page,    setPage]    = useState(1)
  const [hasMore, setHasMore] = useState(true)

  // ── FIX: use ONE ref to track in-flight requests ──
  // isLoading.current = true while a fetch is in progress
  // Prevents duplicate page fetches from rapid scroll events
  const isLoading = useRef(false)

  const [localConns,    setLocalConns]    = useState(
    (user?.connections || []).map(c => c?._id?.toString() || c?.toString() || c)
  )
  const [localSentReqs, setLocalSentReqs] = useState(
    (user?.sentRequests || []).map(c => c?._id?.toString() || c?.toString() || c)
  )

  // ── FIX 1: Reset page/posts when filter changes ──
  useEffect(() => {
    setPage(1)
    setHasMore(true)
    setPosts([])
  }, [category, scope])

  // ── FIX 2: Fetch posts — proper dependency array ──
  useEffect(() => {
    // Guard: don't re-fetch if already loading
    if (isLoading.current) return
    isLoading.current = true
    setLoading(true)

    const isGlobal  = scope === 'global'
    const typeParam = category === 'all' ? '' : category

    getFeed(typeParam, false, isGlobal, page)
      .then(r => {
        const raw = r.data || []

        // ── FIX 3: hasMore check — use actual limit from backend ──
        // Backend sends limit=20, if we got fewer we've reached the end
        if (raw.length < 20) setHasMore(false)

        const sorted = smartSort(raw, user?._id, localConns)

        setPosts(prev =>
          page === 1
            ? sorted
            : [...prev, ...sorted.filter(p => !prev.some(x => x._id === p._id))]
        )
      })
      .catch(() => show('❌ Could not load posts'))
      .finally(() => {
        setLoading(false)
        // ── FIX 4: ALWAYS reset the guard in finally ──
        // Without this, after any error the scroll never works again
        isLoading.current = false
      })
  // ── FIX 5: correct deps — page + filters only ──
  // Don't include localConns/user here — that causes re-fetches on connect
}, [page, category, scope, refreshKey])




useEffect(() => {
  const onScroll = () => {
    sessionStorage.setItem('home_scroll', window.scrollY)
  }

  window.addEventListener('scroll', onScroll)
  return () => window.removeEventListener('scroll', onScroll)
}, [])

useEffect(() => {
  if (posts.length === 0) return

  // ONLY restore when coming from tab navigation
  if (!location.state?.fromNav) return

  const saved = sessionStorage.getItem('home_scroll')
  if (!saved) return

  requestAnimationFrame(() => {
    window.scrollTo(0, parseInt(saved))
  })
}, [posts])

useEffect(() => {
  const handleRefresh = () => {
    setPosts([])
    setHasMore(true)
    setPage(1)
    setRefreshKey(k => k + 1) // 🔥 FORCE re-fetch
    sessionStorage.removeItem('home_scroll')
  }

  window.addEventListener('refreshHome', handleRefresh)
  return () => window.removeEventListener('refreshHome', handleRefresh)
}, [])







  // ── Saved posts ──────────────────────────────────
  useEffect(() => {
    import('../services/api').then(api => {
      api.getSavedPosts()
        .then(r => setSaved((r.data || []).map(p => p._id)))
        .catch(() => {})
    })
  }, [])

  // ── FIX 6: Scroll listener — stable with useCallback ──
  // Using useCallback prevents stale closure over hasMore/loading
  const handleScroll = useCallback(() => {
    // Don't trigger if: no more pages, or already loading
    if (!hasMore || isLoading.current) return

    const scrolledToBottom =
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 300

    if (scrolledToBottom) {
      setPage(p => p + 1)
    }
  }, [hasMore])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // ── Actions ──────────────────────────────────────
  async function handleLike(postId) {
    const post = posts.find(p => p._id === postId)
    if (post) trackInteraction(post.type, 'like')
    const uid = user?._id
    setPosts(prev => prev.map(p => {
      if (p._id !== postId) return p
      const already = (p.likes || []).map(l => l?.toString()).includes(uid)
      return { ...p, likes: already ? p.likes.filter(l => l?.toString() !== uid) : [...(p.likes || []), uid] }
    }))
    try {
      const res = await likePost(postId)
      setPosts(prev => prev.map(p => p._id === postId ? { ...p, likes: res.data.likes } : p))
    } catch { show('❌ Failed. Try again') }
  }

  async function handleSave(postId) {
    const post = posts.find(p => p._id === postId)
    if (post) trackInteraction(post.type, 'save')
    const already = savedIds.includes(postId)
    setSaved(p => already ? p.filter(id => id !== postId) : [...p, postId])
    try { await savePost(postId); show(already ? 'Bookmark removed' : '🔖 Saved!') }
    catch { setSaved(p => already ? [...p, postId] : p.filter(id => id !== postId)) }
  }

  async function handleDelete(postId) {
    try {
      await deletePost(postId)
      setPosts(p => p.filter(x => x._id !== postId))
      show('🗑️ Deleted')
    } catch (e) { show('❌ ' + (e.response?.data?.message || 'Failed')) }
  }

  async function handleConnect(authorId, authorName) {
    try {
      await connectUser(authorId)
      setLocalSentReqs(p => [...p, authorId])
      show(`✅ Request sent to ${authorName?.split(' ')[0] || 'user'}!`)
      refreshUser()
    } catch (e) { show('❌ ' + (e.response?.data?.message || 'Failed')) }
  }

  const visible = posts.filter(p => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      p.text?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q)) ||
      (!p.isAnonymous && p.postedBy?.name?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="page-wrap">

      <header className="home-header">
        <div className="home-logo"><span className="logo-dot" />Nexus</div>
        <div className="home-search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} width={14} height={14}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" placeholder="Search posts, tags…"
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button className="srch-x" onClick={() => setSearch('')}>✕</button>}
        </div>
      </header>

      <div className="cat-row">
        <div className="scope-select-wrap">
          <select className="scope-select" value={scope} onChange={e => setScope(e.target.value)}>
            <option value="college">🏫 My College</option>
            <option value="global">🌐 All</option>
          </select>
          <span className="scope-arrow">▾</span>
        </div>
        <div className="cat-divider" />
        <div className="cat-chips">
          {CATEGORIES.filter(c => c.id !== 'all').map(c => (
            <button key={c.id}
              className={`cat-chip ${category === c.id ? 'on' : ''}`}
              style={category === c.id ? { borderColor: c.color, color: c.color } : {}}
              onClick={() => setCat(category === c.id ? 'all' : c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {(category !== 'all' || scope === 'global') && (
        <div className="active-filter-bar">
          {scope === 'global' && <span className="af-pill">🌐 All colleges</span>}
          {category !== 'all' && (
            <span className="af-pill">{CATEGORIES.find(c => c.id === category)?.label}</span>
          )}
          <button className="af-clear" onClick={() => { setCat('all'); setScope('college') }}>
            Clear ✕
          </button>
        </div>
      )}

      {loading && page === 1 && <div className="feed-loading">Loading posts…</div>}

      {!loading && visible.length === 0 && (
        <div className="feed-empty">
          <div className="fe-icon">📭</div>
          <h3>Nothing here yet</h3>
          <p>{scope === 'global' ? 'No posts from other colleges yet' : 'Be the first to post!'}</p>
          {(category !== 'all' || scope === 'global') && (
            <button onClick={() => { setCat('all'); setScope('college') }}>Show all posts</button>
          )}
        </div>
      )}

      {visible.map(p => (
        <PostCard key={p._id} post={p}
          currentUserId={user?._id}
          onLike={handleLike} onSave={handleSave} onDelete={handleDelete}
          savedIds={savedIds}
          myConnections={localConns} mySentReqs={localSentReqs}
          onConnect={handleConnect}/>
      ))}

      {/* Loading indicator for subsequent pages */}
      {loading && page > 1 && (
        <div style={{ textAlign:'center', padding:'16px 0', color:'var(--dim)', fontSize:'.8rem' }}>
          Loading more…
        </div>
      )}

      {/* End of feed indicator */}
      {!hasMore && posts.length > 0 && (
        <div style={{ textAlign:'center', padding:'20px 0 8px', color:'var(--dim)', fontSize:'.75rem' }}>
          You've seen all posts ✓
        </div>
      )}

      <div style={{ height:14 }}/>
      <Toast msg={msg} onClose={clear}/>
    </div>
  )
}
