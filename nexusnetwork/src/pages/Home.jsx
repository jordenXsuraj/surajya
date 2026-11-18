import { createPortal } from 'react-dom'
import { useLocation, useNavigationType } from 'react-router-dom'
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import MeetNowStrip from '../features/meetnow/MeetNowStrip'
import HeaderActions from '../components/HeaderActions'
import FilterDropdown from '../components/FilterDropdown'
import { savedFeedScope, saveFeedScope } from '../lib/feedScope'
import { PAGE_SIZE, CHECK_SIZE, appendBatch, prependNew, newerThan, oldestOf, cursorOf, newPostsLabel } from '../lib/feedPaging'
import usePullToRefresh from '../hooks/usePullToRefresh'
import useLoadMore from '../hooks/useLoadMore'
import { PostSkeleton, Skeletons, ListFooter, LoadError } from '../components/Loading'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getFeed, likePost, savePost, deletePost,
  addReply, deleteReply, sendInterest, connectUser
} from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import PostCard from '../components/PostCard'
import { likeCountOf, toggleLike, applyLikeResponse } from '../utils/postView'
const CATEGORIES = [
  { id:'all',        label:'All',           color:'var(--text)'   },
  { id:'social',     label:'🔥 Social',     color:'var(--orange)' },
  { id:'study',    label:'📚 Study Material',    color:'var(--green)'  },
   { id:'placement',  label:'💼 Placement',  color:'var(--blue)'   },
  { id:'confession', label:'🤫 Confession', color:'var(--accent)' },
  { id:'project',    label:'🚀 Project',    color:'var(--yellow)' },
  { id:'qa',         label:'❓ Q&A',         color:'var(--purple)' },
  
]

const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  social:     { label:'🔥 Social',     cls:'tag-orange' },
  confession: { label:'🤫 Confession', cls:'tag-red'    },
  project:    { label:'🚀 Project / Partner',    cls:'tag-yellow' },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  study:    { label:'📚 Study Material',    cls:'tag-green'  },
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
  const likeCount  = likeCountOf(post)
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
  const nav  = useNavigate()
  const [del, setDel] = useState(false)

  const isOwn = reply.postedBy?._id === currentUserId ||
                reply.postedBy?._id?.toString() === currentUserId

  const canVisit = reply.postedBy?._id &&
                   reply.postedBy._id?.toString() !== currentUserId

  async function handleDelete() {
    setDel(true)
    try { await deleteReply(postId, reply._id); onDeleted(reply._id) }
    catch { alert('Could not delete') }
    finally { setDel(false) }
  }

  const name     = reply.postedBy?.name || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="reply-item">
      <div
        className="reply-av"
        style={{
          background:'rgba(59,130,246,.15)', color:'#3b82f6',
          overflow:'hidden',
          cursor: canVisit ? 'pointer' : 'default'
        }}
        onClick={() => canVisit && nav(`/profile/${reply.postedBy._id}`)}
      >
        {reply.postedBy?.avatar
          ? <img src={reply.postedBy.avatar} alt={name} loading="lazy"
              style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
          : initials
        }
      </div>
      <div className="reply-content">
        <div className="reply-header">
          <span
            className="reply-name"
            style={{ cursor: canVisit ? 'pointer' : 'default' }}
            onClick={() => canVisit && nav(`/profile/${reply.postedBy._id}`)}
          >
            {name}
          </span>
          <span className="reply-meta">
            {reply.postedBy?.year} yr · {timeAgo(reply.createdAt)}
          </span>
          {isOwn && (
            <button className="reply-delete" onClick={handleDelete} disabled={del}>
              🗑️
            </button>
          )}
        </div>
        <p className="reply-text">{reply.text}</p>
      </div>
    </div>
  )
}





// ── Home Page ─────────────────────────────────────
// Feed filter choices (the order of the dropdown)
const FEED_OPTIONS = [
  { value: 'college',   icon: '🏫', label: 'My College' },
  { value: 'global',    icon: '🌐', label: 'All' },
  { value: 'following', icon: '👥', label: 'Following' },
]

// What the feed looked like when you left Home (posts, filter, place), so coming back from a post or a
// profile — or tapping Home in the nav — puts you where you were instead of loading it all again.
const FEED_CACHE_MS = 30 * 60 * 1000
let feedCache = null   // { scope, category, posts, hasMore, scrollY, anchor: { id, top }, at }

function takeFeedCache(comingBack) {
  const c = feedCache
  if (!comingBack || !c || !c.posts.length || Date.now() - c.at > FEED_CACHE_MS) return null
  return c
}

// The first post card whose bottom is below the header, and where it is on screen
function feedAnchor() {
  for (const el of document.querySelectorAll('.post-card[data-post-id]')) {
    const r = el.getBoundingClientRect()
    if (r.bottom > 80) return { id: el.dataset.postId, top: r.top }
  }
  return null
}

export default function Home() {
  const { user, refreshUser } = useAuth()
  const { msg, show, clear }  = useToast()
  const location = useLocation()
  const navType  = useNavigationType()
  // Back (browser / swipe) or the Home tab: restore the feed as it was
  const [restore] = useState(() => takeFeedCache(navType === 'POP' || Boolean(location.state?.fromNav)))

  const [posts,    setPosts]   = useState(() => restore?.posts ?? [])
  const [category, setCat]     = useState(() => restore?.category ?? 'all')
  // feed filter: 'global' (All), 'college' (My College) or 'following'; remembered for the session
  const [scope, setScopeState] = useState(() => restore?.scope ?? savedFeedScope())
  const setScope = v => { setScopeState(v); saveFeedScope(v) }
  const [search,   setSearch]  = useState('')
  const [loading,  setLoading] = useState(!restore)
  const [savedIds, setSaved]   = useState([])

  // ── Paging (lib/feedPaging.js) ────────────────────
  // The first batch is the newest posts; each next one is "older than the oldest I have" (a cursor,
  // so posts created or deleted meanwhile never repeat or skip one). Each batch is ranked once and
  // appended below — nothing on screen moves. New posts only come in when the user asks for them.
  const [hasMore,     setHasMore]     = useState(() => restore?.hasMore ?? true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError,   setMoreError]   = useState(false)
  const [firstError,  setFirstError]  = useState(false)
  const [newCount,    setNewCount]    = useState(0)
  const gen      = useRef(0)       // bumps on every restart; answers for an older generation are dropped
  const busy     = useRef(false)   // one feed request at a time
  const postsRef = useRef(posts)
  const hasMoreRef = useRef(hasMore)
  const wrapRef  = useRef(null)
  useEffect(() => { postsRef.current = posts; hasMoreRef.current = hasMore })

 const [localConns, setLocalConns] = useState(
  (user?.following || []).map(c => c?._id?.toString() || c?.toString() || c)
)
  const [localSentReqs, setLocalSentReqs] = useState(
    (user?.sentRequests || []).map(c => c?._id?.toString() || c?.toString() || c)
  )
  const connsRef = useRef(localConns)
  useEffect(() => { connsRef.current = localConns })

  const feedArgs = useCallback(() => [category === 'all' ? '' : category, scope === 'following', scope === 'global'], [category, scope])
  // Ranks one new batch (the personal score); never applied to posts already shown
  const rank = useCallback(batch => smartSort(batch, user?._id || '', connsRef.current || []), [user?._id])

  // (Re)loads the newest posts. `keep`: leave the current posts on screen until the new ones arrive.
  const loadFirst = useCallback(({ keep = false } = {}) => {
    const g = ++gen.current
    busy.current = true
    setLoading(true); setLoadingMore(false); setMoreError(false); setFirstError(false); setNewCount(0)
    if (!keep) { setPosts([]); setHasMore(true) }
    return getFeed(...feedArgs(), 1, { limit: PAGE_SIZE })
      .then(r => {
        if (g !== gen.current) return
        const raw = r.data || []
        setPosts(appendBatch([], raw, rank))
        setHasMore(raw.length >= PAGE_SIZE)
      })
      .catch(() => {
        if (g !== gen.current) return
        // nothing on screen: say so with Retry; a failed refresh keeps the posts and shows a toast
        if (postsRef.current.length) show('❌ Could not refresh posts')
        else setFirstError(true)
      })
      .finally(() => { if (g === gen.current) { busy.current = false; setLoading(false) } })
  }, [feedArgs, rank, show])

  const loadMore = useCallback(() => {
    if (busy.current || !hasMoreRef.current) return
    const oldest = oldestOf(postsRef.current)
    if (!oldest) return
    const g = gen.current
    busy.current = true
    setLoadingMore(true); setMoreError(false)
    getFeed(...feedArgs(), 1, { before: cursorOf(oldest), limit: PAGE_SIZE })
      .then(r => {
        if (g !== gen.current) return
        const raw = r.data || []
        setPosts(prev => appendBatch(prev, raw, rank))
        if (raw.length < PAGE_SIZE) setHasMore(false)
      })
      .catch(() => { if (g === gen.current) setMoreError(true) })
      .finally(() => { if (g === gen.current) { busy.current = false; setLoadingMore(false) } })
  }, [feedArgs, rank])

  // Is there anything newer than what is shown? Only sets the count for the pill; the list stays.
  const checkNew = useCallback(() => {
    if (busy.current || document.visibilityState !== 'visible' || !postsRef.current.length) return
    const g = gen.current
    getFeed(...feedArgs(), 1, { limit: CHECK_SIZE })
      .then(r => { if (g === gen.current) setNewCount(newerThan(postsRef.current, r.data || []).length) })
      .catch(() => {})
  }, [feedArgs])

  // Tap on the pill: put the new posts on top and go up. If the check was full of new posts there may
  // be more in between, so the feed starts again from the newest instead of leaving a gap.
  const showNewPosts = useCallback(() => {
    if (busy.current) return
    const g = gen.current
    busy.current = true
    setNewCount(0)
    getFeed(...feedArgs(), 1, { limit: PAGE_SIZE })
      .then(r => {
        if (g !== gen.current) return
        const raw = r.data || []
        if (newerThan(postsRef.current, raw).length >= PAGE_SIZE) {
          setPosts(appendBatch([], raw, rank)); setHasMore(raw.length >= PAGE_SIZE)
        } else {
          setPosts(prev => prependNew(prev, raw, rank))
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
      })
      .catch(() => { if (g === gen.current) show('❌ Could not load new posts') })
      .finally(() => { if (g === gen.current) busy.current = false })
  }, [feedArgs, rank, show])

  // A manual refresh (pull down at the top, or tapping Home while on Home)
  const refresh = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return loadFirst({ keep: true })
  }, [loadFirst])

  // The filter: load when it changes (and on the first visit; not when the feed was restored)
  const latest = useRef({})
  latest.current = { loadFirst, loadMore, checkNew, refresh }
  const restored = useRef(Boolean(restore))
  useEffect(() => {
    if (restored.current) { restored.current = false; return }
    latest.current.loadFirst()
  }, [scope, category])

  // Where the page starts: your old place when the feed was restored, else the top. The anchor post is
  // put back where it was (images above it may still be loading, so it is re-applied a few times
  // until you touch the page).
  useLayoutEffect(() => {
    if (!restore) { window.scrollTo(0, 0); return }
    let touched = false
    const stop = () => { touched = true }
    const place = () => {
      if (touched) return
      const el = restore.anchor && document.querySelector(`.post-card[data-post-id="${restore.anchor.id}"]`)
      if (el) window.scrollBy(0, el.getBoundingClientRect().top - restore.anchor.top)
      else window.scrollTo(0, restore.scrollY)
    }
    place()
    const timers = [50, 250, 600, 1200].map(ms => setTimeout(place, ms))
    const evs = ['wheel', 'touchstart', 'keydown', 'mousedown']
    evs.forEach(e => window.addEventListener(e, stop, { passive: true }))
    return () => { timers.forEach(clearTimeout); evs.forEach(e => window.removeEventListener(e, stop)) }
  }, [restore])

  // Remember the feed and your place for when you come back
  useEffect(() => {
    if (!posts.length) return
    feedCache = { ...(feedCache || {}), scope, category, posts, hasMore, at: Date.now() }
  }, [posts, hasMore, scope, category])
  useEffect(() => {
    let frame = 0
    const save = () => {
      frame = 0
      // after leaving Home the old cards are gone: don't overwrite the place with the next page's
      if (!wrapRef.current?.isConnected || !feedCache) return
      feedCache = { ...feedCache, scrollY: window.scrollY, anchor: feedAnchor(), at: Date.now() }
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(save) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame) }
  }, [])

  // Load the next batch when the end of the list comes near (an observer on a marker under the last
  // post — not a height sum, which was the viewport height and loaded pages on every scroll). 900 px
  // ahead, so a batch is usually there before you reach the end; the spinner shows when it is not.
  const sentinelRef = useLoadMore(() => latest.current.loadMore(), {
    enabled: hasMore && !loading && !moreError && posts.length > 0, margin: 900, watch: posts.length,
  })

  // "New posts" check: every minute while the page is visible, and when you come back to the tab.
  // It never changes the list — it only shows the pill.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') latest.current.checkNew() }
    const t = setInterval(() => latest.current.checkNew(), 60000)
    document.addEventListener('visibilitychange', onVisible)
    if (restore) latest.current.checkNew()
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible) }
  }, [restore])

  // Tapping Home while on Home: refresh (BottomNav also scrolls up)
  useEffect(() => {
    const onRefresh = () => latest.current.refresh()
    window.addEventListener('refreshHome', onRefresh)
    return () => window.removeEventListener('refreshHome', onRefresh)
  }, [])

  // Pull down at the top to refresh (replaces the browser's pull-to-refresh, which reloaded the app)
  const pull = usePullToRefresh(() => latest.current.refresh())
  const refreshing = loading && posts.length > 0

  // ── Saved posts ──────────────────────────────────
  useEffect(() => {
    import('../services/api').then(api => {
      api.getSavedPosts()
        .then(r => setSaved((r.data || []).map(p => p._id)))
        .catch(() => {})
    })
  }, [])

  // ── Actions ──────────────────────────────────────
  async function handleLike(postId) {
    const post = posts.find(p => p._id === postId)
    if (post) trackInteraction(post.type, 'like')
    const uid = user?._id
    setPosts(prev => prev.map(p => {
      if (p._id !== postId) return p
      return toggleLike(p, uid)
    }))
    try {
      const res = await likePost(postId)
      setPosts(prev => prev.map(p => p._id === postId ? applyLikeResponse(p, res.data) : p))
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

  if (!Array.isArray(posts)) {
  return (
    <div style={{ textAlign:'center', padding:'40px' }}>
      Loading...
    </div>
  )
}
  const visible = posts.filter(p => {
    if (!p) return false
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      p.text?.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q)) ||
      (!p.isAnonymous && p.postedBy?.name?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="page-wrap" ref={wrapRef}>

      {/* pull to refresh (touch): follows the finger, "Refreshing…" while the newest posts load */}
      {(pull > 0 || refreshing) && (
        <div className={`ptr${pull >= 64 || refreshing ? ' ready' : ''}`} role="status"
          style={{ transform: `translate(-50%, ${refreshing ? 18 : Math.min(pull, 96) - 30}px)` }}>
          <span className={`ptr-icon${refreshing ? ' spin' : ''}`} aria-hidden="true">↻</span>
          {refreshing ? 'Refreshing…' : pull >= 64 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}

      {/* new posts never push the feed while you read: they wait behind this pill */}
      {newCount > 0 && !refreshing && (
        <button className="feed-new-pill" onClick={showNewPosts}>
          <span aria-hidden="true">↑</span> {newPostsLabel(newCount)}
        </button>
      )}

      <header className="home-header">
        <div className="home-logo"><span className="logo-dot" />MeetNet</div>
        <div className="home-search">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} width={14} height={14}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input type="text" placeholder="Search posts, tags…"
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && <button className="srch-x" onClick={() => setSearch('')}>✕</button>}
        </div>
        <HeaderActions />
      </header>

      <div className="cat-row">
        <FilterDropdown label="Feed" value={scope} onChange={setScope} options={FEED_OPTIONS} />
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
{/* 
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
*/}
      <MeetNowStrip onToast={show} />

      {loading && posts.length === 0 && <Skeletons count={4} of={PostSkeleton} />}
      {!loading && firstError && posts.length === 0 && <LoadError what="posts" onRetry={() => loadFirst()} />}

      {!loading && !firstError && visible.length === 0 && (
        <div className="feed-empty">
          <div className="fe-icon">📭</div>
          <h3>Nothing here yet</h3>
          <p>{scope === 'global' ? 'No posts from other colleges yet'
            : scope === 'following' ? 'No posts from people you follow yet. Follow students in Connect.'
              : 'Be the first to post!'}</p>
          {(category !== 'all' || scope !== 'global') && (
            <button onClick={() => { setCat('all'); setScope('global') }}>Show all posts</button>
          )}
        </div>
      )}

      {visible.map(p => (
        <PostCard key={p._id} post={p}
          currentUserId={user?._id}
          onLike={handleLike}  onDelete={handleDelete}
          savedIds={savedIds}  onSave={handleSave}
          myConnections={localConns} mySentReqs={localSentReqs}
          onConnect={handleConnect}/>
      ))}

      {/* Bottom of feed: the marker that loads the next batch, then spinner / retry / all caught up */}
      {!loading && (
        <ListFooter sentinel={sentinelRef} count={posts.length} loadingMore={loadingMore} error={moreError}
          hasMore={hasMore} onRetry={loadMore} onMore={loadMore} />
      )}

      <div style={{ height:14 }}/>
      <Toast msg={msg} onClose={clear}/>
    </div>
  )
}
