
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { addReply, deleteReply, sendInterest } from '../services/api'



const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  social:     { label:'🔥 Social',     cls:'tag-orange' },
  confession: { label:'🤫 Confession', cls:'tag-red'    },
  project:    { label:'🚀Project/partner',    cls:'tag-yellow' },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  study:    { label:'Study Meterial',    cls:'tag-green'  },
}
/*
function ContributorBadge() {
  return (
    <span title="MeetNet Contributor" style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 16, height: 16,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #f97316, #ff3b5c)',
      fontSize: '.55rem',
      marginLeft: 4,
      flexShrink: 0,
      boxShadow: '0 0 6px rgba(255,59,92,.5)',
      verticalAlign: 'middle'
    }}>
      ✦
    </span>
  )
}
*/

function ContributorBadge() {
  return (
    <span
      title="Top Contributor"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #2563eb, #06b6d4)',
        color: '#fff',
        fontSize: '.7rem',
        marginLeft: 6,
        flexShrink: 0,
        boxShadow: '0 2px 10px rgba(37,99,235,.35)',
        border: '1px solid rgba(255,255,255,.2)'
      }}
    >
      🎓
    </span>
  )
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



function PostCard({ post, currentUserId, onLike, onSave, onDelete, savedIds, myConnections, mySentReqs, onConnect }) {
  const nav = useNavigate()
  // ADD this state inside PostCard alongside other states:
const [expanded, setExpanded] = useState(false)
const [isLong, setIsLong] = useState(false)
const textRef = useRef(null)

  const [showReplies,  setShowR]    = useState(false)
  const [showReplyBox, setReplyBox] = useState(false)
  const [replies,      setReplies]  = useState(post.replies || [])
  const [interested,   setInt]      = useState(false)
  const [connBusy,     setConnBusy] = useState(false)
  const [imgOpen, setImgOpen] = useState(false)
const [reported,    setReported]    = useState(false)
const [showReport,  setShowReport]  = useState(false)
const [showMenu, setShowMenu] = useState(false)
const [reportBusy,  setReportBusy]  = useState(false)

  const t        = TYPE_TAG[post.type] || { label: post.type, cls:'tag-dim' }
  const liked    = (post.likes || []).map(l => l?.toString()).includes(currentUserId)
const saved = (savedIds || []).includes(post._id)
  const isOwn    = post.postedBy?._id?.toString() === currentUserId
  const authorId = post.postedBy?._id?.toString()

const isConn = authorId && (myConnections || []).includes(authorId)
const reqSent = authorId && (mySentReqs || []).includes(authorId)
  const showConn = !isOwn && !post.isAnonymous && authorId && !isConn

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

const [videoOpen, setVideoOpen] = useState(false)

async function handleShare() {
  const url = `${window.location.origin}/post/${post._id}`

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'MeetNet Post',
        text: post.text?.slice(0, 100),
        url
      })
    } else {
      await navigator.clipboard.writeText(url)
      alert('🔗 Link copied')
    }
  } catch {}
}

async function handleReport(reason) {
  if (reported || reportBusy) return
  setReportBusy(true)
  try {
    const token = localStorage.getItem('nx_token')
    const base  = import.meta.env.VITE_API_URL
    await fetch(`${base}/posts/${post._id}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason })
    })
    setReported(true)
    setShowReport(false)
    // show a toast if you have access to show() here, otherwise just state
  } catch {}
  finally { setReportBusy(false) }
}


useEffect(() => {
  const timer = setTimeout(() => {
    const el = textRef.current
    if (!el) return

    setIsLong(el.scrollHeight > el.clientHeight + 2)
  }, 0)

  return () => clearTimeout(timer)
}, [post.text])


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

      {/* ── Head — author + tag ── */}
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

            <div className="pc-name" style={{ display:'flex', alignItems:'center' }}>
  {post.isAnonymous || !post.postedBy ? 'Anonymous' : post.postedBy.name}
  {!post.isAnonymous && post.postedBy?.isContributor && <ContributorBadge />}
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

      {/* ── Today Only badge ── */}
      {post.expiresAt && (
        <span style={{
          fontSize:'.65rem', color:'var(--orange)', fontWeight:700,
          background:'rgba(249,115,22,.1)', padding:'2px 8px',
          borderRadius:6, display:'inline-block', marginBottom:6
        }}>
          ⏳ {Math.max(0, Math.ceil((new Date(post.expiresAt) - Date.now()) / 3600000))}h left · Today Only
        </span>
      )}

      {/* ── Body — text, image, tags, link ── */}
      <div className="pc-body">
        <div>
 <p
  ref={textRef}
  className="pc-text"
  style={{
    overflow: expanded ? 'visible' : 'hidden',
    display: expanded ? 'block' : '-webkit-box',
    WebkitLineClamp: expanded ? 'unset' : 6,
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
    border:'1.5px solid rgba(199, 107, 15, 0.4)',
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
      border:'1px solid rgba(249,115,22,.3)',
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

      {/* ── Actions ── */}
      <div className="pc-actions">
        <button
          className={`act-btn ${liked ? 'liked' : ''}`}
          onClick={() => onLike(post._id)}
        >
          {liked ? '❤️' : '🤍'} {(post.likes || []).length}
        </button>

        {post.type === 'project' ? (
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
 
        
          {/* ── REPORT BUTTON — ADD THIS ── */}


          
<div style={{ position:'relative' }}>

  <button
    className="act-btn menu-trigger"
    onClick={() => setShowMenu(v => !v)}
  >
     ⋯
  </button>

  {showMenu && (
    <div className="three-dot-menu">
      
<button className={`act-btn ${saved ? 'saved' : ''}`} onClick={() => onSave(post._id)}>
          🔖 Save Post
        </button>
      <button
        className="menu-item"
        onClick={() => {
          handleShare()
          setShowMenu(false)
        }}
      >
        🔗 Share Post
      </button>

      <button
        className="menu-item"
        onClick={() => {
          setShowMenu(false)
          setShowReport(true)
        }}
      >
        🚩 Report Post
      </button>

    </div>
  )}

    {showReport && !reported && (
      <div style={{
        position:'absolute',
top:'100%',
right:'-8px',
minWidth:'190px',
marginTop:'6px',
zIndex:999,
        background:'var(--card)', border:'1px solid var(--br2)',
        borderRadius:12, padding:8, zIndex:200,
        minWidth:160, boxShadow:'0 8px 24px rgba(0,0,0,.5)',
        display:'flex', flexDirection:'column', gap:4
      }}>
        <div style={{ fontSize:'.65rem', fontWeight:700, color:'var(--dim)',
          padding:'2px 8px', marginBottom:2 }}>
          Why are you reporting?
        </div>
        {[
          ['spam',           '🗑️ Spam'],
          ['hate',           '😡 Hate speech'],
          ['harassment',     '🚫 Harassment'],
          ['misinformation', '❌ Misinformation'],
          ['other',          '⚠️ Other'],
        ].map(([val, label]) => (
          <button key={val}
            onClick={() => handleReport(val)}
            disabled={reportBusy}
            style={{
              background:'none', border:'none', textAlign:'left',
              padding:'7px 10px', borderRadius:8, cursor:'pointer',
              fontSize:'.75rem', fontWeight:600, color:'var(--muted)',
              fontFamily:'Outfit,sans-serif',
            }}>
            {label}
          </button>
        ))}
        <button onClick={() => setShowReport(false)}
          style={{ background:'none', border:'none', color:'var(--dim)',
            fontSize:'.68rem', cursor:'pointer', padding:'4px',
            fontFamily:'Outfit,sans-serif' }}>
          Cancel
        </button>
      </div>
    )}
  </div>

  
  {/* ── END REPORT BUTTON ── */}
      </div>

      {/* ── Reply box ── */}
      {showReplyBox && (
        <ReplyBox postId={post._id} postType={post.type}
          onAdded={r => { setReplies(p => [...p, r]); setShowR(true) }}
          onClose={() => setReplyBox(false)}/>
      )}

      {/* ── Replies list ── */}
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

export default PostCard