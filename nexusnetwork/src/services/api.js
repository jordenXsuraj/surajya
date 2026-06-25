

import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL 
})

// Attach token to every request
API.interceptors.request.use(cfg => {
  const tok = localStorage.getItem('nx_token')
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`
  return cfg
})

// Auto logout ONLY on 401 — NOT on network error (no internet)
API.interceptors.response.use(
  r => r,
  err => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('nx_user')
      localStorage.removeItem('nx_token')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────
export const signup = d => API.post('/auth/signup', d)
export const login  = d => API.post('/auth/login',  d)

// ── Posts ─────────────────────────────────────────
export const getFeed = (type, connOnly, global, page = 1) =>
  API.get(`/posts${buildQuery({
    type:        type     || '',
    connections: connOnly ? 'true' : undefined,
    global:      global   ? 'true' : undefined,
    page,
    limit: 20
  })}`)

export const createPost   = d            => API.post('/posts', d)
export const likePost     = id           => API.put(`/posts/${id}/like`)
export const savePost     = id           => API.put(`/posts/${id}/save`)
export const deletePost   = id           => API.delete(`/posts/${id}`)
export const sendInterest = id           => API.post(`/posts/${id}/interested`)
export const addReply     = (pid, text)  => API.post(`/posts/${pid}/replies`, { text })
export const deleteReply  = (pid, rid)   => API.delete(`/posts/${pid}/replies/${rid}`)

// ── My profile ────────────────────────────────────
export const getMyProfile  = ()  => API.get('/users/me')
export const updateProfile = d   => API.put('/users/me', d)
export const getMyPosts = (params = '') => API.get(`/users/me/posts${params}`)
export const getSavedPosts = ()  => API.get('/users/me/saved')

// ── Profile photo upload ───────────────────────────
// Use fetch directly in component — axios breaks FormData sometimes
// These helpers are here for reference
export const uploadAvatar = formData => API.post('/users/me/avatar', formData)
export const uploadCover  = formData => API.post('/users/me/cover',  formData)


export const uploadPdf = (formData, onProgress) => {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('nx_token')
    const base  = import.meta.env.VITE_API_URL
    const xhr   = new XMLHttpRequest()

    xhr.upload.onprogress = ev => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.round((ev.loaded / ev.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) }
        catch { reject(new Error('Bad server response')) }
      } else {
        try { reject(new Error(JSON.parse(xhr.responseText).message || 'Upload failed')) }
        catch { reject(new Error(`Upload failed (${xhr.status})`)) }
      }
    }

    xhr.onerror   = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.timeout   = 120000  // 120s for larger PDFs

    xhr.open('POST', `${base}/posts/upload-pdf`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.send(formData)
  })
}


// ── Follow system ─────────────────────────────────
export const connectUser    = id => API.post(`/users/${id}/connect`)   // send request
export const followUser     = id => API.post(`/users/${id}/connect`)   // alias
export const acceptRequest  = id => API.post(`/users/${id}/accept`)    // accept request
export const rejectRequest  = id => API.post(`/users/${id}/reject`)    // reject request
export const unfollowUser   = id => API.post(`/users/${id}/unfollow`)  // unfollow
export const disconnectUser = id => API.post(`/users/${id}/unfollow`)  // alias

// People I follow
export const getFollowing   = () => API.get('/users/following')

// People who follow me
export const getFollowers   = () => API.get('/users/followers')

// Pending requests I received
export const getPendingReqs = () => API.get('/users/requests')

// ── Connect page ──────────────────────────────────
export const getUsers       = skill => API.get(`/users${skill && skill !== 'All' ? `?skill=${skill}` : ''}`)
export const getSuggestions = ()    => API.get('/users/suggestions')

// ── Notifications ─────────────────────────────────
export const getNotifications = ()  => API.get('/notifications')
export const getUnreadCount   = ()  => API.get('/notifications/unread-count')
export const markAllRead      = ()  => API.put('/notifications/mark-read')

// ── Helper ────────────────────────────────────────
function buildQuery(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return q ? `?${q}` : ''
}