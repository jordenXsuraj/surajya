
import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { createPost } from '../services/api'
import Toast from '../components/Toast'
import { useToast } from '../hooks/useToast'
import { useEffect } from 'react'
import { uploadPdf } from '../services/api'

// ── NEW logical content from this file ────────────
// - tip type added
// - placement as default type
// - tags as comma-separated text input
// - anon toggle style
// - confession always anonymous notice
// ─────────────────────────────────────────────────

const POST_TYPES = [
   { id:'placement',  em:'💼', label:'Placement',    desc:'Interview exp, jobs, tips, internship, help' },
  { id:'social',     em:'🔥', label:'Social',       desc:'Hackathon, Events, Achievements, Announcements' },
 
    { id:'confession', em:'🤫', label:'Confession',   desc:'Anonymous, private, safe' },
      { id:'study',    em:'📚', label:'Study Meterial',      desc:'Share what you Have which help other' },
  { id:'qa',         em:'❓', label:'Q&A',          desc:'Ask anything, get answers' },

  { id:'project',    em:'🚀/🤝', label:'Project/Need Partner', desc:'Find project teammates,hare what you built' },


]

// ── Image Compressor ──────────────────────────────
// Runs on device before upload.
// Turns a 10MB photo into ~250KB — 20x faster upload.
function compressImage(file, { maxWidth = 1200, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width  = maxWidth
      }

      const canvas  = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Compression failed')); return }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }))
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Could not read image'))
    }

    img.src = objectUrl
  })
}

export default function Post() {
  const { user }             = useAuth()
  const nav                  = useNavigate()
  const { msg, show, clear } = useToast()
  const fileRef              = useRef(null)
  const xhrRef               = useRef(null)

  // ── State — NEW defaults & fields kept ──────────
  const [type,       setType]      = useState('social')   // new default
  const [text,       setText]      = useState('')
  const [tags,       setTags]      = useState('')            // comma-separated (new logic)
  const [link,       setLink]      = useState('')
  const [anon,       setAnon]      = useState(false)
  const [cloudUrl,   setCloudUrl]  = useState('')
  const [imgPreview, setPreview]   = useState('')

  const [pdfFile,     setPdfFile]     = useState(null)
const [pdfUrl,      setPdfUrl]      = useState('')
const [pdfName,     setPdfName]     = useState('')
const [pdfSize,     setPdfSize]     = useState(0)
const [pdfUploading,setPdfUploading]= useState(false)
const [pdfProgress, setPdfProgress] = useState(0)
const pdfRef = useRef(null)

useEffect(() => {
  return () => {
    if (imgPreview && imgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imgPreview)
    }
  }
}, [imgPreview])





  const [uploading,  setUploading] = useState(false)
  const [uploadPct,  setUploadPct] = useState(0)
  const [publishing, setPublishing]= useState(false)




const [todayOnly, setTodayOnly] = useState(false)
  // ── Type select ──────────────────────────────────
  function selectType(id) {
    setType(id)
    if (id === 'confession') setAnon(true)
    else setAnon(false)
  }

  // ── Fast image upload (restored from old Post.jsx) ─
  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
  show('⚠️ Only image files allowed')
  return
}
    if (file.size > 10 * 1024 * 1024) {
      show('⚠️ Image too large. Max 10MB.')
      return
    }
/*

useEffect(() => {
  return () => {
    if (imgPreview && imgPreview.startsWith('blob:')) {
      URL.revokeObjectURL(imgPreview)
    }
  }
}, [imgPreview])
*/

    // Instant local preview
    const preview = URL.createObjectURL(file)
    setPreview(preview)
    setCloudUrl('')
    setUploading(true)
    setUploadPct(0)
    show('⏳ Compressing…')

    try {
      // Compress on device first — key fix for slow uploads
      const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.82 })

      show('⏳ Uploading…')

      const formData = new FormData()
      formData.append('image', compressed)

      const token = localStorage.getItem('nx_token')
       const base = import.meta.env.VITE_API_URL 

      // XHR for real progress %
      const url = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadPct(Math.round((ev.loaded / ev.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).url) }
            catch { reject(new Error('Bad response from server')) }
          } else {
            try { reject(new Error(JSON.parse(xhr.responseText).message || 'Upload failed')) }
            catch { reject(new Error(`Upload failed (${xhr.status})`)) }
          }
        }

        xhr.onerror   = () => reject(new Error('Network error. Check your connection.'))
        xhr.ontimeout = () => reject(new Error('Upload timed out. Try again.'))
        xhr.timeout   = 30000

        xhr.open('POST', `${base}/posts/upload-image`)
        xhr.setRequestHeader('Authorization', `Bearer ${token}`)
        xhr.send(formData)
      })

      URL.revokeObjectURL(preview)
      setPreview(url)
      setCloudUrl(url)
      setUploadPct(100)
      show('✅ Image ready!')

    } catch (err) {
      show('❌ ' + err.message)
      setPreview('')
      setCloudUrl('')
      if (fileRef.current) fileRef.current.value = ''
    } finally {
      setUploading(false)
      xhrRef.current = null
    }
  }

  function removeImage() {
    // Abort if still uploading
    if (xhrRef.current) { xhrRef.current.abort(); xhrRef.current = null }
    setPreview('')
    setCloudUrl('')
    setUploading(false)
    setUploadPct(0)
    if (fileRef.current) fileRef.current.value = ''
  }

  





  async function handlePdfSelect(e) {
  const file = e.target.files[0]
  if (!file) return
  if (file.type !== 'application/pdf') { show('⚠️ Only PDF files allowed'); return }
  if (file.size > 15 * 1024 * 1024)   {  show('⚠️ Large file, may take time to upload'); return }

  setPdfUploading(true)
  setPdfProgress(0)
  setPdfFile(file)
  setPdfName(file.name)
  setPdfSize(file.size)

  try {
    const fd = new FormData()
    fd.append('pdf', file)
    const data = await uploadPdf(fd, pct => setPdfProgress(pct))
    setPdfUrl(data.url)
    show('✅ PDF ready!')
  } catch (err) {
    show('❌ ' + err.message)
    setPdfFile(null)
    setPdfUrl('')
  } finally {
    setPdfUploading(false)
    if (pdfRef.current) pdfRef.current.value = ''
  }
}

function removePdf() {
  setPdfFile(null)
  setPdfUrl('')
  setPdfName('')
  setPdfSize(0)
  setPdfProgress(0)
  if (pdfRef.current) pdfRef.current.value = ''
}







  // ── Publish — NEW tag parsing logic kept ────────
  async function handlePublish() {
    if (publishing) return

    if (!text.trim())        { show('⚠️ Write something first'); return }
    if (text.trim().length < 5) { show('⚠️ Too short'); return }
    if (uploading)           { show('⏳ Wait for image upload'); return }
    if (imgPreview && !cloudUrl) { show('❌ Image upload failed. Remove it or try again.'); return }







    // NEW: comma-separated tag parsing
  const cleanTags = [...new Set(
  tags
    .split(/[,\s]+/)
    .map(t => t.trim().replace(/^#/, ''))
    .filter(t => t.length > 0)
)].slice(0, 5)

    setPublishing(true)
    try {
      await createPost({
        type,
        text:        text.trim(),
        tags:        cleanTags,
        link:        link.trim().slice(0, 200),
        isAnonymous: type === 'confession' ? true : anon,  // NEW: confession always anon
        imageUrl:    cloudUrl || '', pdfUrl,   
     pdfName,   
     pdfSize,   

         todayOnly   
      })

      show('✅ Posted!')

      // Reset
      setTodayOnly(false)
      setType('social'); setText(''); setTags('')
      setLink(''); setAnon(false)
      setPreview(''); setCloudUrl('')
      if (fileRef.current) fileRef.current.value = ''

      setTimeout(() => nav('/home'), 700)

    } catch (e) {
      show('❌ ' + (e.response?.data?.message || 'Could not publish'))
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="page-wrap">

      {/* Header */}
      <header className="page-header">
        <h1 className="page-title">Share with campus ✍️</h1>
        <p className="page-subtitle">Your post reaches everyone in your college</p>
      </header>

      <div className="post-wrap">

        {/* ── Type selector — old grid style ── */}
        <label className="field-label">What are you sharing?</label>
        <div className="post-type-grid">
          {POST_TYPES.map(t => (
            <button
              key={t.id}
              className={`post-type-btn pt-${t.id} ${type === t.id ? 'on' : ''}`}
              onClick={() => selectType(t.id)}
            >
              <span className="pt-em">{t.em}</span>
              <span className="pt-name">{t.label}</span>
              <span className="pt-desc">{t.desc}</span>
            </button>
          ))}
        </div>

      {/* ── Anonymous toggle — same UI but fixed ── */}
{type !== 'confession' && (
  <div
    className={`anon-row ${anon ? 'on' : ''}`}
    onClick={() => setAnon(a => !a)}
  >
    
    <div className="anon-left">
      <span className="anon-icon">👤</span>

      <div className="anon-text">
        <div className="anon-label">Post anonymously</div>
        <div className="anon-sub">Your name is completely hidden</div>
      </div>
    </div>

    <div className={`anon-toggle ${anon ? 'on' : ''}`}>
      <div className="anon-thumb" />
    </div>

  </div>
)}  

        {/* NEW: confession notice */}
        {type === 'confession' && (
          <div className="confession-notice">
            🤫 Confessions are always posted anonymously
          </div>
        )}



        
        {/* Today Only toggle */}
<div className="field-block">
  <div
    className="anon-row"
    onClick={() => setTodayOnly(t => !t)}
    style={{ cursor:'pointer', borderColor: todayOnly ? 'var(--orange)' : undefined }}
  >
    <div>
      <div className="anon-label">⏳ Today Only</div>
      <div className="anon-sub">Post disappears after 24 hours</div>
    </div>
    <div className={`anon-toggle ${todayOnly ? 'on' : ''}`}
      style={todayOnly ? { background:'var(--orange)', borderColor:'var(--orange)' } : {}}>
      <div className="anon-thumb" />
    </div>
  </div>
</div>



        {/* ── Text ── */}
        <label className="field-label">Write your post</label>
        <textarea
          className="post-textarea"
          placeholder={
            type === 'placement'  ? 'Share placement experience, tips, or opportunity…' :
            type === 'qa'         ? 'Ask your question. More detail = better answers.' :
            type === 'study'    ? 'Share notes, PDF link, or study resource. Add a Google Drive or GitHub link below.' :
            type === 'project'    ? 'Describe your project, what you built…' :
            type === 'social'        ? 'Share a useful tip or insight social life just chill and share anything…' :
            "Say what you feel. No one will know it's you 🤫"
          }
          value={text}
          onChange={e => setText(e.target.value)}
          maxLength={1000}
          rows={5}
        />
        <div className="char-count">{text.length}/1000</div>

        {/* ── Image upload — old UI with fast upload logic ── */}
        <label className="field-label">
          Image <span className="field-optional">— optional, max 10MB , full photo will post as selected</span>
        </label>

        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          style={{ display: 'none' }}
          onChange={handleFile}
        />

        {!imgPreview && (
          <div
            className="img-upload-zone"
            onClick={() => !uploading && fileRef.current?.click()}
          >
            <div className="iuz-icon">📸</div>
            <div>
              <div className="iuz-title">Tap to add a photo</div>
              <div className="iuz-sub">JPG, PNG — max 10MB</div>
            </div>
            <span className="iuz-badge">Optional</span>
          </div>
        )}

        {imgPreview && (
          <div className="img-preview-zone">
            <img
              src={imgPreview}
              alt="preview"
              style={{
                width: '100%',
                aspectRatio: '16/9',
                objectFit: 'cover',
                borderRadius: 14,
                display: 'block',
                border: '1.5px solid var(--br2)',
                opacity: uploading ? 0.55 : 1,
                transition: 'opacity 0.25s',
              }}
            />

            {/* Progress bar */}
            {uploading && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: 4, borderRadius: '0 0 14px 14px',
                background: 'rgba(0,0,0,0.15)',
              }}>
                <div style={{
                  height: '100%',
                  width: `${uploadPct}%`,
                  background: '#6366f1',
                  borderRadius: '0 0 14px 14px',
                  transition: 'width 0.2s ease',
                }}/>
              </div>
            )}

            {/* Status label */}
            {uploading && (
              <div style={{
                position: 'absolute', bottom: 10, left: 12,
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                borderRadius: 20, padding: '2px 10px',
                fontSize: 12, fontWeight: 500,
              }}>
                {uploadPct < 5 ? 'Compressing…' : `Uploading ${uploadPct}%`}
              </div>
            )}

            {/* Uploaded tick */}
            {!uploading && cloudUrl && (
              <div style={{
                position: 'absolute', top: 10, left: 12,
                background: '#22c55e', color: '#fff',
                borderRadius: 20, padding: '2px 10px',
                fontSize: 12, fontWeight: 500,
              }}>
                ✓ Uploaded
              </div>
            )}

            <button className="ipz-remove" onClick={removeImage}>✕</button>
          </div>
        )}



{/* ── PDF Upload ───────────────────────────── */}
<div style={{ marginBottom:18 }}>
  <label className="field-label">
    PDF <span className="field-optional">— optional, max 15MB</span>
  </label>

  <input
    type="file"
    accept="application/pdf"
    ref={pdfRef}
    style={{ display:'none' }}
    onChange={handlePdfSelect}
  />

  {/* No PDF selected yet */}
  {!pdfFile && !pdfUrl && (
    <div
      className="img-upload-zone"
      onClick={() => pdfRef.current?.click()}
      style={{ cursor:'pointer' }}
    >
      <div className="iuz-icon">📄</div>
      <div>
        <div className="iuz-title">Tap to add a PDF</div>
        <div className="iuz-sub">Notes, syllabus, question paper — max 15MB</div>
      </div>
      <div className="iuz-badge">Optional</div>
    </div>
  )}

  {/* Uploading progress */}
  {pdfUploading && (
    <div style={{
      background:'var(--bg2)', border:'1.5px solid var(--br2)',
      borderRadius:12, padding:'14px 16px',
      display:'flex', flexDirection:'column', gap:8
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:'1.4rem' }}>📄</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text)',
            marginBottom:4, overflow:'hidden', textOverflow:'ellipsis',
            whiteSpace:'nowrap' }}>
            {pdfName}
          </div>
          {/* Progress bar */}
          <div style={{ height:4, background:'var(--br2)', borderRadius:4, overflow:'hidden' }}>
            <div style={{
              height:'100%', borderRadius:4,
              background:'linear-gradient(90deg, var(--accent), #f97316)',
              width: `${pdfProgress}%`,
              transition:'width 0.2s ease'
            }}/>
          </div>
        </div>
        <div style={{ fontSize:'.72rem', fontWeight:700,
          color:'var(--accent)', flexShrink:0 }}>
          {pdfProgress}%
        </div>
      </div>
      <div style={{ fontSize:'.68rem', color:'var(--dim)', textAlign:'center' }}>
        Uploading PDF… do not close this page
      </div>
    </div>
  )}

  {/* PDF uploaded successfully */}
  {!pdfUploading && pdfUrl && (
    <div style={{
      background:'var(--bg2)', border:'1.5px solid var(--green)',
      borderRadius:12, padding:'12px 14px',
      display:'flex', alignItems:'center', gap:12
    }}>
      <div style={{ fontSize:'1.6rem' }}>📄</div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:'.82rem', fontWeight:700, color:'var(--text)',
          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {pdfName}
        </div>
        <div style={{ fontSize:'.68rem', color:'var(--dim)', marginTop:2 }}>
          {(pdfSize / 1024).toFixed(0)} KB · Ready to post
        </div>
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <span style={{ fontSize:'.7rem', color:'var(--green)', fontWeight:700 }}>✓</span>
        <button onClick={removePdf}
          style={{ background:'none', border:'none', cursor:'pointer',
            color:'var(--muted)', fontSize:'.85rem', padding:3 }}>
          ✕
        </button>
      </div>
    </div>
  )}
</div>




        {/* ── Tags — NEW comma-separated input ── */}
{/*        <label className="field-label">
          Tags <span className="field-optional">— comma separated, max 5</span>
        </label>
        <input
          className="post-input"
          placeholder="e.g. DSA, placement, TCS"
          value={tags}
          onChange={e => setTags(e.target.value)}
        />
*/}
        {/* ── Link ── */}
        <label className="field-label">
          Link <span className="field-optional">— optional</span>
        </label>
        <input
          className="post-input"
          placeholder="GitHub, Figma, Notion, YouTube…"
          value={link}
          onChange={e => setLink(e.target.value)}
        />

        {/* ── Publish button ── */}
        <button
          className="publish-btn"
          onClick={handlePublish}
          disabled={publishing || uploading}
        >
          {publishing ? 'Posting…'         :
           uploading  ? `Uploading ${uploadPct}%…` :
           `Post as ${anon || type === 'confession' ? 'Anonymous' : 'You'} →`}
        </button>

      </div>

      <div style={{ height: 20 }} />
      <Toast msg={msg} onClose={clear} />
    </div>
  )
}
