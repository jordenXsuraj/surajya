import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'
import PostCard from '../components/PostCard'

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