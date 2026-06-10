
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { likePost, savePost, addReply, deleteReply } from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import axios from 'axios'
import { createPortal } from 'react-dom'

const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  Study:    { label:'📚Study Meterial',    cls:'tag-green'  },
  project:    { label:'🚀Project',    cls:'tag-yellow' },
  tip:        { label:'💡 Tip',        cls:'tag-orange' },
  social:     { label:'🔥 Social',     cls:'tag-orange' },
  confession: { label:'🤫 Confession', cls:'tag-red'    },
}

function getYouTubeId(url) {
  if (!url) return null

  const patterns = [
    /youtube\.com\/watch\?v=([^&\s]+)/,
    /youtu\.be\/([^?\s]+)/,
    /youtube\.com\/embed\/([^?\s]+)/,
    /youtube\.com\/shorts\/([^?\s]+)/
  ]

  for (const p of patterns) {
    const m = url.match(p)
    if (m?.[1]) return m[1]
  }

  return null
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

export default function ConnectionFeed() {
  const { user }             = useAuth()
  const { msg, show, clear } = useToast()
  const nav                  = useNavigate()

  const [posts,   setPosts]   = useState([])
  const [loading, setLoading] = useState(true)
   const [imgOpen, setImgOpen] = useState(false)
  const [savedIds, setSaved]  = useState([])
  const [search,  setSearch]  = useState('')

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  useEffect(() => {
    const token = localStorage.getItem('nx_token')
    const base = import.meta.env.VITE_API_URL 
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
   const [imgOpen, setImgOpen] = useState(false)
  const [showReplyBox, setReplyBox]   = useState(false)
const [expanded, setExpanded] = useState(false)
const [isLong, setIsLong] = useState(false)
const textRef = useRef(null)

  const t     = TYPE_TAG[post.type] || { label: post.type, cls:'tag-dim' }
  const isOwn = post.postedBy?._id?.toString() === currentUserId
const [videoOpen, setVideoOpen] = useState(false)

useEffect(() => {
  const timer = setTimeout(() => {
    const el = textRef.current
    if (!el) return

    setIsLong(el.scrollHeight > el.clientHeight + 2)
  }, 0)

  return () => clearTimeout(timer)
}, [post.text])


const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
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
        <div>
<p
  ref={textRef}
  className="pc-text"
  style={{
    overflow: expanded ? 'visible' : 'hidden',
    display: expanded ? 'block' : '-webkit-box',
    WebkitLineClamp: expanded ? 'unset' : 7,
    WebkitBoxOrient: 'vertical',
    marginBottom: isLong ? 4 : 0,
  }}
>
    {post.text}
  </p>
  {isLong && (
    <button
      onClick={e => { e.stopPropagation(); setExpanded(b => !b) }}
      style={{
        background: 'none',
        border: 'none',
        color: 'var(--accent)',
        fontSize: '.78rem',
        fontWeight: 700,
        cursor: 'pointer',
        padding: '2px 0',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {expanded ? '▲ See less' : '▼ See more'}
    </button>
  )}
</div>


{/* Image with tap-to-expand */}
{post.imageUrl && (
  <>
    <div className="pc-image-wrap" onClick={() => setImgOpen(true)}>
      <div className="pc-image-bg"
        style={{ backgroundImage: `url(${post.imageUrl})` }} />
      <img src={post.imageUrl} alt="post" className="pc-image-main" loading="lazy" />
      <div className="img-tap-hint">🔍 Tap to expand</div>
    </div>

    {/* Portal — renders directly on body, outside all cards */}
    {imgOpen && createPortal(
      <div
        className="img-fs-overlay"
        onClick={() => setImgOpen(false)}
      >
        <button
          className="img-fs-close"
          onClick={e => { e.stopPropagation(); setImgOpen(false) }}
        >
          ✕
        </button>
        <img
          src={post.imageUrl}
          alt="post"
          className="img-fs-main"
          onClick={e => e.stopPropagation()}
        />
      </div>,
      document.body
    )}
  </>
)}

{post.youtubeUrl && (
  <>
    <div
      className="pc-image-wrap"
      onClick={() => setVideoOpen(true)}
    >
      <img
        src={`https://img.youtube.com/vi/${getYouTubeId(post.youtubeUrl)}/mqdefault.jpg`}
        alt="YouTube"
        className="pc-image-main"
      />

      <div className="img-tap-hint">
        ▶ Tap to watch
      </div>
    </div>

    {videoOpen && createPortal(
      <div
        className="img-fs-overlay"
        onClick={() => setVideoOpen(false)}
      >
        <button
          className="img-fs-close"
          onClick={e => {
            e.stopPropagation()
            setVideoOpen(false)
          }}
        >
          ✕
        </button>

        <div
          onClick={e => e.stopPropagation()}
          style={{
            width:'95%',
            maxWidth:'1000px',
            aspectRatio:'16/9'
          }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${getYouTubeId(post.youtubeUrl)}?autoplay=1`}
            title="YouTube"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              width:'100%',
              height:'100%',
              border:'none',
              borderRadius:'12px'
            }}
          />
        </div>
      </div>,
      document.body
    )}
  </>
)}


{post.pdfUrl?.length > 0 && (
  <div style={{
    display:'flex',
    alignItems:'center',
    gap:12,
    padding:'12px 14px',
    background:'var(--bg2)',
    border:'1.5px solid var(--br2)',
    borderRadius:14,
    margin:'10px 0',
    boxShadow:'0 4px 14px rgba(0,0,0,0.25)'
  }}>

    {/* ICON */}
    <div style={{
      width:44,
      height:44,
      borderRadius:12,
      background:'linear-gradient(135deg, rgba(239,68,68,.15), rgba(239,68,68,.05))',
      border:'1px solid rgba(239,68,68,.25)',
      display:'flex',
      alignItems:'center',
      justifyContent:'center',
      fontSize:'1.4rem',
      flexShrink:0
    }}>
      📄
    </div>

    {/* FILE INFO */}
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{
        fontSize:'.85rem',
        fontWeight:700,
        color:'var(--text)',
        overflow:'hidden',
        textOverflow:'ellipsis',
        whiteSpace:'nowrap'
      }}>
        {post.pdfName || 'Document.pdf'}
      </div>

      <div style={{
        fontSize:'.65rem',
        color:'var(--dim)',
        marginTop:2
      }}>
        PDF {post.pdfSize > 0 ? `· ${(post.pdfSize / 1024).toFixed(0)} KB` : ''}
      </div>

      {/* 🔥 Message only for mobile */}
      {isMobile && (
        <div style={{
          fontSize:'.6rem',
          color:'var(--dim)',
          marginTop:3
        }}>
          Download available on laptop 💻
        </div>
      )}
    </div>

    {/* ACTION BUTTONS */}
    <div style={{ display:'flex', gap:6, flexShrink:0 }}>

      {/* VIEW */}
      <a
        href={`https://docs.google.com/viewer?url=${encodeURIComponent(post.pdfUrl)}&embedded=true`}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          padding:'6px 12px',
          borderRadius:8,
          background:'rgba(59,130,246,.12)',
          border:'1px solid rgba(59,130,246,.25)',
          color:'#3b82f6',
          fontSize:'.72rem',
          fontWeight:700,
          textDecoration:'none',
          whiteSpace:'nowrap'
        }}
      >
        👁 View
      </a>

      {/* 🔥 DOWNLOAD ONLY ON LAPTOP */}
      {!isMobile && (
        <a
          href={post.pdfUrl}
          download={post.pdfName || 'document.pdf'}
          onClick={e => e.stopPropagation()}
          style={{
            padding:'6px 12px',
            borderRadius:8,
            background:'rgba(34,197,94,.12)',
            border:'1px solid rgba(34,197,94,.25)',
            color:'#22c55e',
            fontSize:'.72rem',
            fontWeight:700,
            textDecoration:'none',
            whiteSpace:'nowrap'
          }}
        >
          ⬇ Download
        </a>
      )}

    </div>

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
       <button
  className={`act-btn ${liked ? 'liked' : ''}`}
  onClick={() => onLike(initialPost._id)}
>
  {liked ? '❤️' : '🤍'} {(initialPost.likes || []).length}
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
