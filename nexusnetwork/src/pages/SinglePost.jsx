import { useParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
import PostCard from '../components/PostCard'
import DocPage from '../components/DocPage'
import { useAuth } from '../context/AuthContext'

function ContributorBadge() {
  return (
    <span
      title="Top Contributor"
      style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        width:18,
        height:18,
        borderRadius:'50%',
        background:'linear-gradient(135deg,#f59e0b,#f97316)',
        color:'#fff',
        fontSize:'0.7rem',
        marginLeft:6,
        boxShadow:'0 2px 8px rgba(249,115,22,.35)',
        border:'1px solid rgba(255,255,255,.15)'
      }}
    >
      ★
    </span>
  )
}

// What to say when a shared post can't be shown
function loadError(err) {
  const status = err.response?.status
  if (status === 400) return { title: 'Link not valid', text: "This post link doesn't look right. Check that it was copied completely." }
  if (status === 404) return { title: 'Post not available', text: 'This post was deleted, has expired, or is not visible to you.' }
  return { title: "Couldn't load this post", text: 'Check your internet connection and try again.', retry: true }
}

export default function SinglePost() {
  const { id } = useParams()
  const { user } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const key = `${id}:${attempt}`
  // Result of the latest request; anything for another id/attempt counts as still loading
  const [result, setResult] = useState({ key: null })

  useEffect(() => {
    let alive = true
    axios
      .get(`${import.meta.env.VITE_API_URL}/posts/${id}`)
      .then(r => { if (alive) setResult({ key, post: r.data }) })
      .catch(err => { if (alive) setResult({ key, error: loadError(err) }) })
    return () => { alive = false }
  }, [id, key])

  const { post, error } = result.key === key ? result : {}

  if (error) {
    return (
      <DocPage title={error.title}>
        <div className="doc-card">
          <p style={{ marginTop: 0 }}>{error.text}</p>
          {error.retry && (
            <button className="ob-btn" onClick={() => setAttempt(a => a + 1)}>Try again</button>
          )}
          <Link to={user ? '/home' : '/'} className="ob-link" style={{ textAlign: 'center' }}>
            Go to MeetNet →
          </Link>
        </div>
      </DocPage>
    )
  }

  if (!post) return <div className="loading-text">Loading…</div>

return (
  <div className="page-wrap">
    <PostCard
      post={post}
      currentUserId=""
      onLike={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      savedIds={[]}
      myConnections={[]}
      mySentReqs={[]}
      onConnect={() => {}}
    />
  </div>
)
}