import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
import PostCard from '../components/PostCard'

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

export default function SinglePost() {
  const { id } = useParams()
  const [post, setPost] = useState(null)

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/posts/${id}`)
      .then(r => setPost(r.data))
  }, [id])

  if (!post) return <div>Loading...</div>

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