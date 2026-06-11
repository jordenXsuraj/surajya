import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import axios from 'axios'

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
    <div style={{ padding:'20px' }}>
      <h2>{post.postedBy?.name}</h2>
      <p>{post.text}</p>

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          style={{ maxWidth:'100%' }}
        />
      )}
    </div>
  )
}