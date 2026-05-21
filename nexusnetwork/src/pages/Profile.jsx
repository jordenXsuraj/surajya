

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  getMyPosts, getSavedPosts,
  getFollowing, getFollowers,
  updateProfile, deletePost, savePost,
  likePost,
  addReply, deleteReply
} from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'

// ── Branch skills ─────────────────────────────────
const BRANCH_SKILLS = {
  'AI': [
  'Python',
  'Machine Learning',
  'Deep Learning',
  'Data Science',
  'TensorFlow',
  'PyTorch',
  'NLP',
  'Computer Vision',
  'Generative AI',
  'Prompt Engineering',
  'MLOps',
  'SQL'
],
  'CS':          ['React','Node.js','Python','Java','C++','DSA','MongoDB','MySQL','TypeScript','Next.js','Django','Flutter','Android','DevOps','ML / AI','UI / UX','Figma','Firebase','Spring Boot','Git'],
  'IT':          ['React','Node.js','Python','Java','Networking','Cybersecurity','Cloud (AWS)','Docker','Linux','MySQL','MongoDB','PHP','Django','TypeScript','Git','UI / UX','Figma','DevOps'],
    'CyberSecurity': [
  'Networking',
  'Linux',
  'Ethical Hacking',
  'Penetration Testing',
  'Web Security',
  'Cryptography',
  'OWASP Top 10',
  'Nmap',
  'Burp Suite',
  'Metasploit',
  'Cloud Security',
  'Python'
],
  'Robotics': [
  'C++',
  'Python',
  'Embedded Systems',
  'Microcontrollers',
  'Arduino',
  'Raspberry Pi',
  'ROS (Robot Operating System)',
  'Control Systems',
  'Sensors & Actuators',
  'Computer Vision',
  'Machine Learning',
  'Kinematics',
  'SLAM',
  'IoT',
  'PCB Design',
  'Electronics',
  'Mechatronics',
  'Autonomous Systems',
  'Path Planning',
  'Simulation (Gazebo)'
],
  'Civil':       ['AutoCAD','STAAD Pro','Revit','SketchUp','MS Project','Primavera','ETABS','SAP2000','Surveying','Estimation & Costing','GIS','MATLAB','Concrete Design','Steel Design'],
  'Mechanical':  ['AutoCAD','SolidWorks','CATIA','ANSYS','Fusion 360','MATLAB','Pro-E','CNC Programming','Thermodynamics','FEA','CAM','3D Printing','PLC Programming','Hydraulics','Robotics'],
  'Electrical':  ['MATLAB','Simulink','PLC Programming','AutoCAD Electrical','Circuit Design','Power Systems','SCADA','Arduino','Embedded Systems','Control Systems','PSPICE','Relay Protection'],
  'Electronics': ['Arduino','Raspberry Pi','MATLAB','Embedded Systems','PCB Design','VLSI','Verilog / VHDL','Circuit Design','8051 / ARM','IoT','Multisim','LabVIEW','Signal Processing','FPGA'],
  'ENTC':        ['Arduino','Embedded Systems','PCB Design','MATLAB','Raspberry Pi','IoT','Signal Processing','Verilog','8051','Communication Systems','LabVIEW','VLSI'],
  'Chemical':    ['MATLAB','Aspen Plus','HYSYS','AutoCAD','ChemCAD','ANSYS Fluent','MS Excel (Advanced)','Process Design','Safety Engineering','Python'],
  'Other':       ['MS Office','Research','Technical Writing','Data Analysis','Python','MATLAB','Project Management','Communication','Leadership','Teamwork']
}
const BRANCHES = ['AI','CS','IT','CyberSecurity','Robotics','Civil','Mechanical','Electrical','ENTC','Chemical','Other']

const TYPE_TAG = {
  placement:  { label:'💼 Placement',  cls:'tag-blue'   },
  qa:         { label:'❓ Q&A',         cls:'tag-purple' },
  partner:    { label:'🤝 Partner',    cls:'tag-green'  },
  project:    { label:'🚀 Project',    cls:'tag-yellow' },
  tip:        { label:'💡 Tip',        cls:'tag-orange' },
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

function getInstagramId(url) {
  if (!url) return null
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([^/?]+)/)
  return m?.[1] || null
}

function detectMediaType(url) {
  if (!url) return null
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  // Instagram — only profile links now, not posts/reels
  if (url.includes('instagram.com')) return 'instagram'
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

function isYouTubeShort(url) {
  return url?.includes('/shorts/')
}

// ── IMAGE COMPRESSION — this is the key fix ───────
// Shrinks a File to max 800px and 70% quality before upload
// A 3MB phone photo becomes ~150-250KB
// Upload goes from 10 seconds to under 1 second on mobile data
async function compressImage(file, maxWidth = 800, quality = 0.72) {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calculate new dimensions keeping aspect ratio
      let w = img.width
      let h = img.height
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w)
        w = maxWidth
      }

      // Draw on canvas at reduced size
      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)

      // Convert to blob
     const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg'

    canvas.toBlob(
     blob => resolve(blob || file),
     format,
      quality
    )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file) // fallback: use original
    }

    img.src = url
  })
}

// ── Media thumbnail component ─────────────────────
function MediaItem({ item, onRemove, isOwn }) {
  const [showPlayer, setShowPlayer] = useState(false)

 if (item.type === 'youtube' || item.type === 'yt-video' ||
    item.type === 'yt-short' || item.type === 'yt-channel' ||
    item.type === 'yt-playlist') {
  const ytId    = getYouTubeId(item.url)
  const isShort = isYouTubeShort(item.url) || item.type === 'yt-short'
    if (!ytId) return null

    return (
      <div
        className={`media-card ${isShort ? 'media-short' : 'media-video'}`}
        onClick={() => setShowPlayer(true)}
      >
        {showPlayer ? (
          <div className="media-player-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1`}
              title="YouTube"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ width:'100%', height:'100%', border:'none' }}
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
            {isShort && <div className="media-short-badge">Short</div>}
          </>
        )}
        {isOwn && !showPlayer && (
          <button
            className="media-remove-btn"
            onClick={e => { e.stopPropagation(); onRemove(item) }}
          >✕</button>
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
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <a
          href={`https://instagram.com/${username}`}
          target="_blank"
          rel="noreferrer"
          className="ig-visit-btn"
          onClick={e => e.stopPropagation()}
        >
          Visit ↗
        </a>
        {isOwn && (
          <button
            className="media-remove-btn"
            style={{ position:'static', width:24, height:24 }}
            onClick={e => { e.stopPropagation(); onRemove(item) }}
          >✕</button>
        )}
      </div>
    </div>
  )
}

  return null
}

// ── Media Tab ─────────────────────────────────────
function MediaTab({ mediaItems, isOwn, onAdd, onRemove }) {
  const [newUrl,    setNewUrl]   = useState('')
  const [urlError,  setUrlError] = useState('')
  const [showInput, setShowInput]= useState(false)

  const detectedType = detectMediaType(newUrl)
  const isValid = detectedType &&
  (detectedType === 'youtube' ? !!getYouTubeId(newUrl) : isInstagramProfile(newUrl))

  function handleAdd() {
    if (!newUrl.trim()) { setUrlError('Paste a URL first'); return }
    if (!detectedType) { setUrlError('Only YouTube or Instagram links'); return }
    if (!isValid) { setUrlError('Invalid URL format'); return }
    onAdd({ type: detectedType, url: newUrl.trim() })
    setNewUrl(''); setUrlError(''); setShowInput(false)
  }

const ytItems = (mediaItems || []).filter(m =>
  ['youtube','yt-video','yt-short','yt-channel','yt-playlist'].includes(m.type)
)
const igItems = (mediaItems || []).filter(m => m.type === 'instagram')

  if (mediaItems?.length === 0 && !isOwn) {
    return (
      <div className="conn-empty" style={{ padding:'30px 20px' }}>
        <div style={{ fontSize:'2rem' }}>🎬</div>
        <h3>No media yet</h3>
        <p>This student hasn't added any videos yet</p>
      </div>
    )
  }

  return (
    <div style={{ padding:'14px' }}>
      {isOwn && (
        <div style={{ marginBottom:16 }}>
          {!showInput ? (
            <button className="yt-add-btn" onClick={() => setShowInput(true)}>
              + Add YouTube or Instagram
            </button>
          ) : (
            <div className="media-add-box">
              <input
                className="edit-input"
                placeholder="YouTube video URL or instagram.com/yourusername"
                value={newUrl}
                onChange={e => { setNewUrl(e.target.value); setUrlError('') }}
                autoFocus
                style={{ marginBottom:6 }}
              />
              {newUrl.trim() !== '' && (
                <div style={{
                  fontSize:'.72rem', marginBottom:8, fontWeight:600,
                  color: isValid ? 'var(--green)' : 'var(--accent)'
                }}>

                 

              {isValid
              ? detectedType === 'youtube'
                 ? '✅ YouTube video detected'
                 : `✅ Instagram profile @${getInstagramUsername(newUrl) || 'user'} detected`

                  : detectedType === 'instagram'
                  ? '⚠️ Paste your Instagram profile link (instagram.com/username), not a post or reel'

                   : '⚠️ Paste a YouTube video or Instagram profile link'
                  }




                </div>

                
              )}

              {urlError && (
                <div style={{ fontSize:'.72rem', color:'var(--accent)', marginBottom:8 }}>
                  {urlError}
                </div>
              )}
              <div style={{ display:'flex', gap:8 }}>
                <button className="reply-submit" onClick={handleAdd}
                  disabled={!isValid} style={{ flex:1, height:40 }}>Add</button>
                <button className="reply-cancel"
                  onClick={() => { setShowInput(false); setNewUrl(''); setUrlError('') }}
                  style={{ height:40 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mediaItems?.length === 0 && isOwn && (
        <div style={{ textAlign:'center', padding:'16px 0 8px', color:'var(--dim)', fontSize:'.8rem' }}>
          Add YouTube videos, Shorts, Instagram  profile etc
        </div>
      )}

      {ytItems.length > 0 && (
        <>
          <div className="media-section-label">YouTube</div>
          <div className="media-grid">
            {ytItems.slice(0, 6).map((item, i) => (
              <MediaItem key={i} item={item} isOwn={isOwn} onRemove={onRemove} />
            ))}
          </div>
        </>
      )}

      {igItems.length > 0 && (
        <>
          <div className="media-section-label" style={{ marginTop: ytItems.length > 0 ? 18 : 0 }}>
            Instagram
          </div>
          <div className="media-grid">
            {igItems.slice(0, 6).map((item, i) => (
              <MediaItem key={i} item={item} isOwn={isOwn} onRemove={onRemove} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LikeBtn({ post, currentUser }) {
  const myId = currentUser?._id?.toString() || ''
  const [liked,     setLiked]     = useState(
    (post.likes || []).map(l => l?.toString()).includes(myId)
  )
  const [likeCount, setLikeCount] = useState(post.likes?.length || 0)

  async function handleLike() {
    setLiked(p => !p)
    setLikeCount(p => liked ? p - 1 : p + 1)
    try { await likePost(post._id) }
    catch {
      setLiked(p => !p)
      setLikeCount(p => liked ? p + 1 : p - 1)
    }
  }

  return (
    <button
      className={`mp-like-btn ${liked ? 'on' : ''}`}
      onClick={handleLike}
    >
      {liked ? '❤️' : '🤍'} {likeCount}
    </button>
  )
}


function MiniPost({ post, canDelete, onDelete, currentUserId, canUnsave, onUnsave, currentUser }) {
  const [replies,  setReplies] = useState(post.replies || [])
  const [showR,    setShowR]   = useState(false)
  const [showBox,  setShowBox] = useState(false)
  const [rt,       setRt]      = useState('')
  const [sub,      setSub]     = useState(false)
  const t = TYPE_TAG[post.type] || { label: post.type, cls:'tag-dim' }

  function ago(d) {
    const h = Math.floor((Date.now() - new Date(d)) / 3600000)
    if (h < 1) return 'just now'
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
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
      setReplies(p => [...p, { ...res.data, postedBy: currentUser }])
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
      <div className="mp-header">
        <span className={`tag ${t.cls}`} style={{ fontSize:'.6rem' }}>{t.label}</span>
        <span className="mp-time">
          {new Date(post.createdAt).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
        </span>
        <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
          {canDelete && <button className="mp-del" onClick={() => onDelete(post._id)}>🗑️</button>}
          {canUnsave && (
            <button className="mp-del" onClick={() => onUnsave(post._id)}
              style={{ color:'var(--yellow)' }}>🔖✕</button>
          )}
        </div>
      </div>

      {post.imageUrl?.length > 0 && (
        <img
          src={post.imageUrl}
          alt="post"
          loading="lazy"
          className="mp-image"
        />
      )}

      <p className="mp-text" style={{ padding:'9px 12px 0', whiteSpace:'pre-wrap' }}>{post.text}</p>

{post.pdfUrl?.length > 0 && (
  <div style={{
    display:'flex', alignItems:'center', gap:12,
    padding:'12px 14px',
    background:'var(--bg2)',
    border:'1.5px solid var(--br2)',
    borderRadius:12,
    margin:'10px 0',
    transition:'border-color .2s',
  }}
    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--br2)'}
  >
    {/* PDF icon */}
    <div style={{
      width:42, height:42, borderRadius:10,
      background:'rgba(239,68,68,.12)',
      border:'1px solid rgba(239,68,68,.25)',
      display:'flex', alignItems:'center',
      justifyContent:'center', fontSize:'1.3rem', flexShrink:0
    }}>📄</div>

    {/* Name + size */}
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text)',
        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        marginBottom:2 }}>
        {post.pdfName || 'Document.pdf'}
      </div>
      <div style={{ fontSize:'.65rem', color:'var(--dim)' }}>
        PDF{post.pdfSize > 0 ? ` · ${(post.pdfSize / 1024).toFixed(0)} KB` : ''}
      </div>
    </div>

    {/* Action buttons */}
    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
      {/* View in browser */}
      <a
        href={post.pdfUrl}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        style={{
          padding:'6px 12px', borderRadius:8,
          background:'var(--bl)',
          border:'1px solid rgba(59,130,246,.25)',
          color:'var(--blue)',
          fontSize:'.72rem', fontWeight:700,
          textDecoration:'none', whiteSpace:'nowrap',
        }}
      >
        👁 View
      </a>
      {/* Download */}
      <a
        href={post.pdfUrl}
        download={post.pdfName || 'document.pdf'}
        onClick={e => e.stopPropagation()}
        style={{
          padding:'6px 12px', borderRadius:8,
          background:'var(--gl)',
          border:'1px solid rgba(34,197,94,.25)',
          color:'var(--green)',
          fontSize:'.72rem', fontWeight:700,
          textDecoration:'none', whiteSpace:'nowrap',
        }}
      >
        ⬇ Save
      </a>
    </div>
  </div>
)}

      {post.tags?.length > 0 && (
        <div style={{ display:'flex', flexWrap:'wrap', gap:5, padding:'6px 12px 0' }}>
          {post.tags.map(tg => <span key={tg} className="post-tag">#{tg}</span>)}
        </div>
      )}

      {/* ── ADDED: link display ── */}
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

<div className="mp-footer" style={{ gap:7, paddingTop:8, alignItems:'center' }}>
  <LikeBtn post={post} currentUser={currentUser} />
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

      {showBox && (
        <div className="profile-reply-box">
          <textarea className="profile-reply-input" autoFocus
            placeholder={post.type === 'qa' ? 'Write your answer…' : 'Write a reply…'}
            value={rt} onChange={e => setRt(e.target.value)} maxLength={500} />
          <div className="profile-reply-footer">
            <span style={{ fontSize:'.65rem', color:'var(--dim)' }}>{rt.length}/500</span>
            <div style={{ display:'flex', gap:7 }}>
              <button className="reply-cancel" onClick={() => { setShowBox(false); setRt('') }}>Cancel</button>
              <button className="reply-submit" onClick={submitReply} disabled={sub || !rt.trim()}>
                {sub ? '…' : post.type === 'qa' ? 'Answer' : 'Post'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showR && replies.length > 0 && (
        <div className="replies-list">
          {replies.map(r => {
            const isOwn = r.postedBy?._id === currentUserId || r.postedBy?._id?.toString() === currentUserId
            return (
              <div key={r._id} className="reply-item">
                <div className="reply-av" style={{ background:'rgba(59,130,246,.15)', color:'#3b82f6', overflow:'hidden' }}>
                  {r.postedBy?.avatar
                    ? <img src={r.postedBy.avatar} alt=""
                        style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
                    : initials(r.postedBy?.name)
                  }
                </div>
                <div className="reply-content">
                  <div className="reply-header">
                    <span className="reply-name">{r.postedBy?.name || 'User'}</span>
                    <span className="reply-meta">{r.postedBy?.year} yr · {ago(r.createdAt)}</span>
                    {isOwn && <button className="reply-delete" onClick={() => removeReply(r._id)}>🗑️</button>}
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





function av(name) {
  if (!name) return 'VN'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function UserRow({ u, index, onClick }) {
  const col = AV_COLORS[index % AV_COLORS.length]
  return (
    <div className="person-card" onClick={() => onClick(u._id)} style={{ cursor:'pointer' }}>
      {u.avatar
        ? <img src={u.avatar} alt={u.name} loading="lazy"
            style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
        : <div className="av-md" style={{ background:col.bg, color:col.color, flexShrink:0 }}>{av(u.name)}</div>
      }
      <div className="person-info">
        <div className="person-name">{u.name}</div>
        <div className="person-role">{u.year} yr {u.branch} · {u.college}</div>
        <div className="person-skills">
          {(u.skills || []).slice(0, 3).map(s => <span key={s} className="skill-tag">{s}</span>)}
        </div>
      </div>
    </div>
  )
}

function PeopleSheet({ title, people, loading, onClose, onView }) {
  return (
    <div className="people-sheet-overlay" onClick={onClose}>
      <div className="people-sheet" onClick={e => e.stopPropagation()}>
        <div className="people-sheet-header">
          <span>{title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="people-sheet-list">
          {loading && <div className="loading-text">Loading…</div>}
          {!loading && people.length === 0 && (
            <p className="empty-hint" style={{ textAlign:'center', padding:'20px' }}>
              {title === 'Following' ? 'Not following anyone yet' : 'No followers yet'}
            </p>
          )}
          {!loading && people.map((u, i) => (
            <UserRow key={u._id} u={u} index={i}
              onClick={id => { onClose(); onView(id) }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Profile Page ──────────────────────────────────
export default function Profile() {
  const { user, logout, updateUser, refreshUser } = useAuth()
  const nav = useNavigate()
  const { msg, show, clear } = useToast()

  const avatarRef = useRef(null)
  const coverRef  = useRef(null)

  const [tab,       setTab]      = useState('posts')
  const [editMode,  setEdit]     = useState(false)
  const [saving,    setSaving]   = useState(false)
  const [uploading, setUploading]= useState(null)

  const [sheet,     setSheet]    = useState(null)

  const [myPosts,   setMyPosts]   = useState([])
  const [saved,     setSaved]     = useState([])
  const [following, setFollowing] = useState([])
  const [followers, setFollowers] = useState([])
  const [loadingP,  setLP]        = useState(true)

  const [eName,      setEName]    = useState('')
  const [eBio,       setEBio]     = useState('')
  const [eYear,      setEYear]    = useState('')
  const [eBranch,    setEBranch]  = useState('CS')
  const [eSkills,    setESkills]  = useState([])
  const [eProjects,  setEProj]    = useState([])
  const [eRoadmap,   setERoad]    = useState('')
  const [eMedia,     setEMedia]   = useState([])
  const [newPN,      setNewPN]    = useState('')
  const [newPL,      setNewPL]    = useState('')
  const [customSk,   setCustom]   = useState('')
const [eUsername, setEUsername] = useState('')

useEffect(() => {
  setLP(true)

  // Load only important first
  getMyPosts()
    .then(res => setMyPosts(res.data || []))
    .finally(() => setLP(false))

  // Load others in background (non-blocking)
setTimeout(() => {
  getSavedPosts().then(res => setSaved(res.data || []))
  getFollowing().then(res => setFollowing(res.data || []))
  getFollowers().then(res => setFollowers(res.data || []))
}, 0)

  refreshUser()
}, [])


async function handleAvatarFile(e) {
  const file = e.target.files[0]
  if (!file) return
  setUploading('avatar')
  try {
    const compressed = await compressImage(file, 400, 0.75)
    const fd = new FormData()
    fd.append('image', compressed, 'avatar.jpg')
    const token = localStorage.getItem('nx_token')
    /*
     const base = import.meta.env.VITE_API_URL + '/api'
    const res   = await fetch(`${base}/users/me/avatar`, {
      method:'POST',
       headers:{ Authorization:`Bearer ${token}` }, 
       body:fd
    })*/
   const base = import.meta.env.VITE_API_URL 

const res = await fetch(`${base}/users/me/avatar`, {
  method:'POST',
  headers:{ Authorization:`Bearer ${token}` },
  body:fd
})
    const data = await res.json()
    if (!res.ok) throw new Error(data.message)
    updateUser({ avatar: data.avatar })
    show('✅ Profile photo updated!')
  } catch (err) { show('❌ ' + err.message) }
  finally { setUploading(null); if (avatarRef.current) avatarRef.current.value = '' }
}




async function handleCoverFile(e) {
  const file = e.target.files[0]
  if (!file) return
  setUploading('cover')
  try {
    const compressed = await compressImage(file, 1200, 0.75)
    const fd = new FormData()
    fd.append('image', compressed, 'cover.jpg')
    const token = localStorage.getItem('nx_token')
    /*
     const base = import.meta.env.VITE_API_URL + '/api'
    const res   = await fetch(`${base}/users/me/cover`, {
      method:'POST', headers:{ Authorization:`Bearer ${token}` }, body:fd
    })*/
const base = import.meta.env.VITE_API_URL 

const res = await fetch(`${base}/users/me/cover`, {
  method:'POST',
  headers:{ Authorization:`Bearer ${token}` },
  body:fd
})
    const data = await res.json()
    if (!res.ok) throw new Error(data.message)
    updateUser({ coverImage: data.coverImage })
    show('✅ Cover updated!')
  } catch (err) { show('❌ ' + err.message) }
  finally { setUploading(null); if (coverRef.current) coverRef.current.value = '' }
}



  function openEdit() {
    setEName(user?.name     || '')
    setEUsername(user?.username || '')
    setEBio(user?.bio       || '')
    setEYear(user?.year     || '1st')
    setEBranch(user?.branch || 'CS')
    setESkills([...(user?.skills   || [])])
    setEProj([...(user?.projects   || [])])
    setERoad(user?.roadmap  || '')
    setEMedia([...(user?.mediaItems || [])])
    setNewPN(''); setNewPL(''); setCustom('')
    setEdit(true)
  }

  async function saveEdit() {
    if (!eName.trim()) return show('⚠️ Name cannot be empty')
    setSaving(true)
    try {
      const res = await updateProfile({
        name: eName.trim(), bio: eBio,
        year: eYear, branch: eBranch,
        skills: eSkills, projects: eProjects,
        roadmap: eRoadmap, mediaItems: eMedia,
          username: eUsername.trim()     
      })
      updateUser(res.data)
      setEdit(false)
      show('✅ Profile updated!')
    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Update failed'))
    } finally { setSaving(false) }
  }

  function toggleSkill(s) { setESkills(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]) }
  function addCustomSkill() {
    const s = customSk.trim(); if (!s) return
    if (!eSkills.includes(s)) setESkills(p => [...p, s]); setCustom('')
  }

  async function handleDelete(postId) {
    try { await deletePost(postId); setMyPosts(p => p.filter(x => x._id !== postId)); show('🗑️ Deleted') }
    catch { show('❌ Could not delete') }
  }

  async function handleUnsave(postId) {
    try { await savePost(postId); setSaved(p => p.filter(x => x._id !== postId)); show('Bookmark removed') }
    catch { show('❌ Could not unsave') }
  }

  async function handleLiveMediaAdd(item) {
    const newMedia = [...(user?.mediaItems || []), item]
    try { const res = await updateProfile({ mediaItems: newMedia }); updateUser(res.data); show('✅ Added!') }
    catch { show('❌ Failed') }
  }

  async function handleLiveMediaRemove(item) {
    const newMedia = (user?.mediaItems || []).filter(m => m.url !== item.url)
    try { const res = await updateProfile({ mediaItems: newMedia }); updateUser(res.data); show('Removed') }
    catch { show('❌ Failed') }
  }

  const branchList   = BRANCH_SKILLS[eBranch] || BRANCH_SKILLS['CS']
  const displayPosts = tab === 'posts' ? myPosts : saved

  return (
    <div className="page-wrap">

      {/* Cover */}
      <div className="prof-cover-wrap">
        {user?.coverImage
          ? <img src={user.coverImage} loading="lazy" decoding="async" alt="cover" className="prof-cover-img" />
          : <div className="prof-cover" />
        }
        <input type="file" accept="image/*" ref={coverRef}
          style={{ display:'none' }} onChange={handleCoverFile} />

        {uploading === 'cover' ? (
  <div className="upload-progress-bar">
    <div className="upload-progress-fill cover-fill" />
    <span className="upload-progress-text">Uploading cover…</span>
  </div>
) : (
  <button className="cover-edit-btn" onClick={() => coverRef.current?.click()}>
    📷 Edit cover
  </button>
)}
      </div>

      {/* Avatar */}
      <div className="prof-top-row">
        <div className="prof-av-wrap">
          <input type="file" accept="image/*" ref={avatarRef}
            style={{ display:'none' }} onChange={handleAvatarFile} />
          {user?.avatar
            ? <img src={user.avatar} loading="lazy" decoding="async" className="prof-av-img" />
            : <div className="prof-av">{av(user?.name)}</div>
          }


          {uploading === 'avatar' ? (
  <div className="avatar-upload-ring">
    <div className="avatar-upload-spinner" />
  </div>
) : (
  <button className="prof-av-edit" onClick={() => avatarRef.current?.click()}>
    📷
  </button>
)}

        </div>
        <div className="prof-action-btns">
          {editMode ? (
            <>
              <button className="pab-cancel" onClick={() => setEdit(false)} disabled={saving}>Cancel</button>
              <button className="pab-save" onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : '✓ Save'}
              </button>
            </>
          ) : (
            <>
              <button className="pab-edit" onClick={openEdit}>Edit Profile</button>
              <button className="pab-share" onClick={() => show('🔗 Link copied!')}>Share</button>
            </>
          )}
        </div>
      </div>

      {/* ── VIEW MODE ── */}
      {!editMode && (
        <>
          <div className="prof-info">
            <h2 className="prof-name">{user?.name}</h2>
          
<p className="prof-handle">
  @{user?.username || user?.name?.toLowerCase().replace(/\s+/g, '.')}
</p>
            
            <p className="prof-bio" style={{ whiteSpace:'pre-wrap' }}>
              {user?.bio || 'No bio yet. Tap Edit Profile to add one.'}
            </p>
            <div className="prof-meta-tags">
              <span className="tag tag-blue">{user?.year} year</span>
              <span className="tag tag-dim">{user?.branch}</span>
              <span className="tag tag-green">🏫 {user?.college}</span>
            </div>
          </div>

          <div className="prof-stats">
            <div className="prof-stat">
              <div className="ps-num">{myPosts.length}</div>
              <div className="ps-lbl">Posts</div>
            </div>
            <div className="prof-stat prof-stat-clickable" onClick={() => setSheet('following')}>
              <div className="ps-num">{following.length}</div>
              <div className="ps-lbl">Following ›</div>
            </div>
            <div className="prof-stat prof-stat-clickable" onClick={() => setSheet('followers')}>
              <div className="ps-num">{followers.length}</div>
              <div className="ps-lbl">Followers ›</div>
            </div>
          </div>

          <section className="prof-section">
            <div className="section-header">
              <h3 className="section-title">Skills</h3>
              <button className="section-edit" onClick={openEdit}>+ Edit</button>
            </div>
            <div className="skill-badges">
              {(user?.skills || []).length > 0
                ? user.skills.map(s => <span key={s} className="skill-badge">{s}</span>)
                : <p className="empty-hint">No skills yet</p>}
            </div>
          </section>

          <section className="prof-section">
            <div className="section-header">
              <h3 className="section-title">Projects</h3>
              <button className="section-edit" onClick={openEdit}>+ Add</button>
            </div>
            {(user?.projects || []).length > 0
              ? user.projects.map((p, i) => (
                  <div key={i} className="project-card">
                    <div className="proj-icon-wrap">🚀</div>
                    <div>
                      <div className="proj-name">{p.name}</div>
                      {p.link && <div className="proj-link">{p.link}</div>}
                    </div>
                  </div>
                ))
              : <p className="empty-hint">No projects</p>}
          </section>

          {/* Roadmap hidden */}
          {/* <section className="prof-section">...</section> */}
        </>
      )}

      {/* ── EDIT MODE ── */}
      {editMode && (
        <div className="edit-form">
          <h3 className="edit-section-title">Basic Info</h3>
          <label className="edit-label">Name</label>
          <input className="edit-input" value={eName}
            onChange={e => setEName(e.target.value)} placeholder="Full name" />
          <label className="edit-label">Bio</label>
          <textarea className="edit-input edit-textarea-tall" value={eBio}
            onChange={e => setEBio(e.target.value)}
            placeholder={"Tell your campus about yourself…\n\nPress Enter for new lines."}
            maxLength={250} />
          <div style={{ fontSize:'.65rem', color:'var(--dim)', textAlign:'right', marginTop:-6, marginBottom:10 }}>
            {eBio.length}/250
          
          
          </div>


<label className="edit-label">Username</label>
<div style={{ position:'relative' }}>
  <span style={{
    position:'absolute', left:12, top:'50%',
    transform:'translateY(-50%)',
    color:'var(--dim)', fontSize:'.85rem'
  }}>@</span>
  <input
    className="edit-input"
    style={{ paddingLeft:24 }}
    placeholder="yourname.123"
    value={eUsername}
    onChange={e => setEUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
    maxLength={20}
  />
</div>
{eUsername && (
  <div style={{ fontSize:'.65rem', marginTop:-8, marginBottom:4,
    color: /^[a-z0-9_.]{3,20}$/.test(eUsername) ? 'var(--green)' : 'var(--accent)' }}>
    {/^[a-z0-9_.]{3,20}$/.test(eUsername)
      ? `✅ @${eUsername}`
      : '⚠️ 3-20 chars, only letters/numbers/._'}
  </div>
)}

          <div className="edit-row2">
            <div>
              <label className="edit-label">Year</label>
              <select className="edit-input" value={eYear} onChange={e => setEYear(e.target.value)}>
                {['1st','2nd','3rd','4th'].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="edit-label">Branch</label>
              <select className="edit-input" value={eBranch} onChange={e => setEBranch(e.target.value)}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>

          <h3 className="edit-section-title">
            Skills · <span style={{ fontSize:'.7rem', fontWeight:500, color:'var(--dim)' }}>{eBranch}</span>
          </h3>
          {eSkills.length > 0 && (
            <div className="selected-skills" style={{ marginBottom:10 }}>
              {eSkills.map(s => (
                <span key={s} className="sel-skill">
                  {s} <button onClick={() => toggleSkill(s)}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="skill-picker-grid" style={{ marginBottom:10 }}>
            {branchList.map(s => (
              <button key={s} className={`skill-pick-btn ${eSkills.includes(s) ? 'on' : ''}`}
                onClick={() => toggleSkill(s)}>
                {eSkills.includes(s) ? '✓ ' : ''}{s}
              </button>
            ))}
          </div>
          <div className="custom-skill-row">
            <input className="edit-input" placeholder="+ Add your own skill"
              value={customSk} onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill() } }}
              style={{ marginBottom:0, flex:1 }} />
            <button className="custom-skill-add-btn"
              onClick={addCustomSkill} disabled={!customSk.trim()}>Add</button>
          </div>

          <h3 className="edit-section-title">Projects</h3>
          {eProjects.map((p, i) => (
            <div key={i} className="edit-project-item">
              <div>
                <div className="epname">{p.name}</div>
                {p.link && <div className="eplink">{p.link}</div>}
              </div>
              <button className="ep-remove"
                onClick={() => setEProj(pr => pr.filter((_, idx) => idx !== i))}>🗑️</button>
            </div>
          ))}
          <div className="add-project-box">
            <input className="edit-input" placeholder="Project name *"
              value={newPN} onChange={e => setNewPN(e.target.value)} />
            <input className="edit-input" placeholder="GitHub / link (optional)"
              value={newPL} onChange={e => setNewPL(e.target.value)} />
            <button className="add-proj-btn" onClick={() => {
              if (!newPN.trim()) return show('⚠️ Project name required')
              setEProj(p => [...p, { name: newPN.trim(), link: newPL.trim() }])
              setNewPN(''); setNewPL('')
            }}>+ Add Project</button>
          </div>

          <h3 className="edit-section-title">Media (YouTube + Instagram)</h3>
          <MediaTab
            mediaItems={eMedia}
            isOwn={true}
            onAdd={item => setEMedia(p => [...p, item])}
            onRemove={item => setEMedia(p => p.filter(m => m.url !== item.url))}
          />

          <button className="save-big-btn" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save All Changes ✓'}
          </button>
          <button className="cancel-big-btn" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      )}

      {/* ── TABS ── */}
      {!editMode && (
        <>
          <div className="posts-tabs">
            <button className={`posts-tab ${tab === 'posts' ? 'on' : ''}`}
              onClick={() => setTab('posts')}>
              Posts ({myPosts.length})
            </button>
            <button className={`posts-tab ${tab === 'media' ? 'on' : ''}`}
              onClick={() => setTab('media')}>
              Media 🎬 {(user?.mediaItems?.length || 0) > 0 ? `(${user.mediaItems.length})` : ''}
            </button>
            <button className={`posts-tab ${tab === 'saved' ? 'on' : ''}`}
              onClick={() => setTab('saved')}>
              🔖 Saved ({saved.length})
            </button>
          </div>

          {tab === 'posts' && (
            <div className="posts-grid">
              {loadingP && <div className="loading-text">Loading…</div>}
              {!loadingP && myPosts.length === 0 && (
                <p className="empty-hint" style={{ textAlign:'center', padding:'20px 0' }}>No posts yet.</p>
              )}
              {!loadingP && myPosts.map(p => (
                <MiniPost key={p._id} post={p}
                  canDelete={true} onDelete={handleDelete}
                  currentUserId={user?._id} currentUser={user} />
              ))}
            </div>
          )}

          {tab === 'media' && (
            <MediaTab
              mediaItems={user?.mediaItems || []}
              isOwn={true}
              onAdd={handleLiveMediaAdd}
              onRemove={handleLiveMediaRemove}
            />
          )}

          {tab === 'saved' && (
            <div className="posts-grid">
              {loadingP && <div className="loading-text">Loading…</div>}
              {!loadingP && saved.length === 0 && (
                <p className="empty-hint" style={{ textAlign:'center', padding:'20px 0' }}>No saved posts yet.</p>
              )}
              {!loadingP && saved.map(p => (
                <MiniPost key={p._id} post={p}
                  canUnsave={true} onUnsave={handleUnsave}
                  currentUserId={user?._id} currentUser={user} />
              ))}
            </div>
          )}
        </>
      )}

      {!editMode && (
        <button className="logout-btn" onClick={() => { logout(); nav('/') }}>Log Out</button>
      )}

      {sheet && (
        <PeopleSheet
          title={sheet === 'following' ? 'Following' : 'Followers'}
          people={sheet === 'following' ? following : followers}
          loading={loadingP}
          onClose={() => setSheet(null)}
          onView={id => nav(`/profile/${id}`)}
        />
      )}

      <Toast msg={msg} onClose={clear} />
    </div>
  )
}