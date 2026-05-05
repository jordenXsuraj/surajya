
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { likePost, savePost, addReply, deleteReply } from '../services/api'
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

function timeAgo(d) {
  const h = Math.floor((Date.now() - new Date(d)) / 3600000)
  if (h < 1)  return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function av(name) {
  if (!name) return '??'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

// ── Reply box ─────────────────────────────────────
function ReplyBox({ postId, postType, onAdded, onClose }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!text.trim()) return
    setBusy(true)
    try {
      const res = await addReply(postId, text.trim())
      onAdded(res.data)
      setText('')
      onClose()
    } catch (e) {
      alert(e.response?.data?.message || 'Failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="reply-box">
      <textarea
        className="reply-input"
        autoFocus
        placeholder={postType === 'qa' ? 'Write your answer…' : 'Write a reply…'}
        value={text}
        onChange={e => setText(e.target.value)}
        maxLength={500}
        onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submit() }}
      />
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

// ── Reply item ────────────────────────────────────
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

  const name     = reply.postedBy?.name || 'User'
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <div className="reply-item">
      <div className="reply-av"
        style={{ background:'rgba(59,130,246,.15)', color:'#3b82f6', overflow:'hidden' }}>
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
          {isOwn && (
            <button className="reply-delete" onClick={handleDelete} disabled={del}>🗑️</button>
          )}
        </div>
        <p className="reply-text">{reply.text}</p>
      </div>
    </div>
  )
}

export default function ConnectionFeed() {
  const { user }             = useAuth()
  const { msg, show, clear } = useToast()
  const nav                  = useNavigate()

  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
  const [savedIds, setSaved]  = useState([])
  const [search,  setSearch]  = useState('')

  useEffect(() => {
    const token = localStorage.getItem('nx_token')
    const base = import.meta.env.VITE_API_URL + '/api'
    const h     = { Authorization: `Bearer ${token}` }

    setLoading(true)

    axios.get(`${base}/posts?connections=true`, { headers: h })
      .then(r => setPosts(r.data || []))
      .catch(() => show('❌ Could not load feed'))
      .finally(() => setLoading(false))

    axios.get(`${base}/users/me/saved`, { headers: h })
      .then(r => setSaved((r.data || []).map(p => p._id)))
      .catch(() => {})
  }, [])

  async function handleLike(postId) {
    const uid = user?._id
    setPosts(prev => prev.map(p => {
      if (p._id !== postId) return p
      const already = (p.likes || []).map(l => l?.toString()).includes(uid)
      return { ...p, likes: already ? p.likes.filter(l => l?.toString()!==uid) : [...(p.likes||[]), uid] }
    }))
    try { await likePost(postId) }
    catch { show('❌ Like failed') }
  }

  async function handleSave(postId) {
    const already = savedIds.includes(postId)
    setSaved(p => already ? p.filter(id => id!==postId) : [...p, postId])
    try { await savePost(postId); show(already ? 'Bookmark removed' : '🔖 Saved!') }
    catch { show('❌ Save failed') }
  }

  const visible = posts.filter(p => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    return (
      p.text?.toLowerCase().includes(q) ||
      p.tags?.some(t => t?.toLowerCase().includes(q)) ||
      (!p.isAnonymous && p.postedBy?.name?.toLowerCase().includes(q))
    )
  })

  return (
    <div className="page-wrap">

      <header className="home-header">
        <div className="home-logo"><span className="logo-dot"/>MeetNet</div>
        <div style={{ flex:1, paddingLeft:8 }}>
          <div style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text)' }}>Following</div>
          <div style={{ fontSize:'.68rem', color:'var(--dim)' }}>Posts from people you follow</div>
        </div>
      </header>

      <div className="home-search" style={{ margin:'8px 14px 4px' }}>
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} width={14} height={14}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" placeholder="Search by name, tag, or post…"
          value={search} onChange={e => setSearch(e.target.value)}/>
        {search && <button className="srch-x" onClick={() => setSearch('')}>✕</button>}
      </div>

      {loading && <div className="feed-loading">Loading…</div>}

      {!loading && posts.length === 0 && (
        <div className="feed-empty">
          <div className="fe-icon">🤝</div>
          <h3>No posts yet</h3>
          <p>Follow students to see their posts here</p>
          <button onClick={() => nav('/connect')}>Find People</button>
        </div>
      )}

      {!loading && posts.length > 0 && visible.length === 0 && (
        <div className="feed-empty">
          <div className="fe-icon">🔍</div>
          <h3>No results for "{search}"</h3>
          <p>Try a different name, tag, or keyword</p>
          <button onClick={() => setSearch('')}>Clear search</button>
        </div>
      )}

      {!loading && visible.map(p => (
        <PostCard
          key={p._id}
          post={p}
          currentUserId={user?._id}
          liked={(p.likes||[]).map(l => l?.toString()).includes(user?._id)}
          saved={savedIds.includes(p._id)}
          onLike={handleLike}
          onSave={handleSave}
          onNav={nav}
        />
      ))}

      <div style={{ height:14 }}/>
      <Toast msg={msg} onClose={clear}/>
    </div>
  )
}

// ── Post card with replies ────────────────────────
// Extracted into component so each card owns its own
// reply/show-replies state without polluting parent
function PostCard({ post: initialPost, currentUserId, liked, saved, onLike, onSave, onNav }) {
  const [post,         setPost]       = useState(initialPost)
  const [replies,      setReplies]    = useState(initialPost.replies || [])
  const [showReplies,  setShowR]      = useState(false)
  const [showReplyBox, setReplyBox]   = useState(false)

  const t     = TYPE_TAG[post.type] || { label: post.type, cls:'tag-dim' }
  const isOwn = post.postedBy?._id?.toString() === currentUserId

  function goToProfile() {
    if (!post.isAnonymous && post.postedBy?._id && !isOwn) {
      onNav(`/profile/${post.postedBy._id}`)
    }
  }

  return (
    <article className="post-card">
      {/* Head */}
      <div className="pc-head">
        <div
          className={`pc-author-wrap ${!post.isAnonymous && post.postedBy ? 'clickable' : ''}`}
          onClick={goToProfile}
        >
          {post.isAnonymous || !post.postedBy
            ? <div className="av-anon">👤</div>
            : post.postedBy.avatar
              ? <img src={`${post.postedBy.avatar}?f_auto&q_auto&w=100`} alt={post.postedBy.name}
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
        <span className={`tag ${t.cls}`} style={{ marginLeft:'auto' }}>{t.label}</span>
      </div>

      {/* Body */}
      <div className="pc-body">
        <p className="pc-text" style={{ whiteSpace:'pre-wrap' }}>{post.text}</p>

        {post.imageUrl && (
          <div className="pc-image-wrap">
            <div className="pc-image-bg"
              style={{ backgroundImage: `url(${post.imageUrl})` }} />
            <img src={`${post.imageUrl}?f_auto&q_auto&w=900`} alt="post"
              className="pc-image-main" />
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

      {/* Actions — like · reply · bookmark */}
      <div className="pc-actions">
        <button className={`act-btn ${liked ? 'liked' : ''}`} onClick={() => onLike(post._id)}>
          ❤️(initialPost.likes || []).length
        </button>

        {/* Reply button */}
        <button className="act-btn" onClick={() => setReplyBox(b => !b)}>
          {post.type === 'qa' ? '✍️ Answer' : '💬 Reply'}
          {replies.length > 0 && ` (${replies.length})`}
        </button>

        {/* Toggle show replies */}
        {replies.length > 0 && (
          <button className="act-btn" onClick={() => setShowR(b => !b)}>
            {showReplies ? '▲' : `▼ ${replies.length}`}
          </button>
        )}

        <div style={{ flex:1 }}/>

        <button className={`act-btn ${saved ? 'saved' : ''}`} onClick={() => onSave(post._id)}>
          🔖
        </button>
      </div>

      {/* Reply box */}
      {showReplyBox && (
        <ReplyBox
          postId={post._id}
          postType={post.type}
          onAdded={r => {
            setReplies(p => [...p, r])
            setShowR(true)
            setReplyBox(false)
          }}
          onClose={() => setReplyBox(false)}
        />
      )}

      {/* Replies list */}
      {showReplies && replies.length > 0 && (
        <div className="replies-list">
          {replies.map(r => (
            <ReplyItem
              key={r._id}
              reply={r}
              postId={post._id}
              currentUserId={currentUserId}
              onDeleted={rid => setReplies(p => p.filter(x => x._id !== rid))}
            />
          ))}
        </div>
      )}
    </article>
  )
}
