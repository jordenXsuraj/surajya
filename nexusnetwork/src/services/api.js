/*
import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
})

// Attach token to every request
API.interceptors.request.use(cfg => {
  const tok = localStorage.getItem('nx_token')
  //const tok = localStorage.getItem('nexus_token')
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`
  return cfg
})

// Auto logout on 401
API.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('nx_user')
      localStorage.removeItem('nx_token')
      //localStorage.removeItem('nexus_user')
      //localStorage.removeItem('nexus_token')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// Auth
export const signup  = d => API.post('/auth/signup', d)
export const login   = d => API.post('/auth/login', d)

// Posts
export const getFeed    = type => API.get(`/posts${type && type !== 'all' ? `?type=${type}` : ''}`)
export const createPost = d    => API.post('/posts', d)
export const likePost   = id   => API.put(`/posts/${id}/like`)
export const deletePost = id   => API.delete(`/posts/${id}`)

// Users / Connect
export const getUsers     = skill => API.get(`/users${skill && skill !== 'All' ? `?skill=${skill}` : ''}`)
export const connectUser  = id    => API.post(`/users/${id}/connect`)
export const getMyProfile = ()    => API.get('/users/me')
export const updateProfile = d    => API.put('/users/me', d)
export const getMyPosts    = ()   => API.get('/users/me/posts')
export const getLikedPosts = ()   => API.get('/users/me/liked')
export const getMyAnswers  = ()   => API.get('/users/me/answers') */

/*
import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
})

// Attach token to every request
API.interceptors.request.use(cfg => {
  const tok = localStorage.getItem('nx_token')
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`
  return cfg
})

// Auto-logout on 401
API.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('nx_user')
      localStorage.removeItem('nx_token')
      window.location.href = '/'
    }
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────
export const signup  = d => API.post('/auth/signup', d)
export const login   = d => API.post('/auth/login',  d)

// ── Posts ─────────────────────────────────────────
export const getFeed        = (type, connOnly) =>
  API.get(`/posts${buildQuery({ type, connections: connOnly ? 'true' : undefined })}`)
export const createPost     = d   => API.post('/posts', d)
export const likePost       = id  => API.put(`/posts/${id}/like`)
export const deletePost     = id  => API.delete(`/posts/${id}`)
export const sendInterest   = id  => API.post(`/posts/${id}/interested`)

// ── Users ─────────────────────────────────────────
export const getUsers          = skill => API.get(`/users${skill && skill !== 'All' ? `?skill=${skill}` : ''}`)
export const getMyProfile      = ()    => API.get('/users/me')
export const updateProfile     = d     => API.put('/users/me', d)
export const getMyPosts        = ()    => API.get('/users/me/posts')
export const getLikedPosts     = ()    => API.get('/users/me/liked')

// ── Connections ────────────────────────────────────
export const connectUser       = id => API.post(`/users/${id}/connect`)
export const acceptRequest     = id => API.post(`/users/${id}/accept`)
export const rejectRequest     = id => API.post(`/users/${id}/reject`)
export const getPendingReqs    = () => API.get('/users/requests')
export const getConnections    = () => API.get('/users/connections')

// ── Notifications ──────────────────────────────────
export const getNotifications  = ()  => API.get('/notifications')
export const getUnreadCount    = ()  => API.get('/notifications/unread-count')
export const markAllRead       = ()  => API.put('/notifications/mark-read')

// ── Helper ────────────────────────────────────────
function buildQuery(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return q ? `?${q}` : ''
}
  */



/*
import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
})

API.interceptors.request.use(cfg => {
  const tok = localStorage.getItem('nx_token')
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`
  return cfg
})

API.interceptors.response.use(
  r => r,
  err => {
    // Only logout on 401 — NOT on network errors (no internet)
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('nx_user')
      localStorage.removeItem('nx_token')
      window.location.href = '/'
    }
    // Network error (no internet) — do nothing, stay logged in
    return Promise.reject(err)
  }
)

// ── Auth ──────────────────────────────────────────
export const signup = d => API.post('/auth/signup', d)
export const login  = d => API.post('/auth/login',  d)

// ── Posts ─────────────────────────────────────────/*
export const getFeed = (type, connOnly, global) =>
  API.get(`/posts${buildQuery({
    type:        type        || '',
    connections: connOnly    ? 'true' : undefined,
    global:      global      ? 'true' : undefined
  })}`)
export const createPost   = d  => API.post('/posts', d)
export const likePost     = id => API.put(`/posts/${id}/like`)
export const savePost = id => API.put(`/posts/${id}/save`)
export const deletePost   = id => API.delete(`/posts/${id}`)
export const sendInterest = id => API.post(`/posts/${id}/interested`)

// ── Replies ───────────────────────────────────────
export const addReply     = (postId, text) => API.post(`/posts/${postId}/replies`, { text })
export const deleteReply  = (postId, replyId) => API.delete(`/posts/${postId}/replies/${replyId}`)

// ── Users ─────────────────────────────────────────
export const getUsers      = skill => API.get(`/users${skill && skill !== 'All' ? `?skill=${skill}` : ''}`)
export const getMyProfile  = ()    => API.get('/users/me')
export const updateProfile = d     => API.put('/users/me', d)
export const getMyPosts    = ()    => API.get('/users/me/posts')
export const getSavedPosts = ()    => API.get('/users/me/saved')
export const deleteAccount = ()    => API.delete('/users/me')

// ── Connections ───────────────────────────────────
export const connectUser    = id => API.post(`/users/${id}/connect`)
export const acceptRequest  = id => API.post(`/users/${id}/accept`)
export const rejectRequest  = id => API.post(`/users/${id}/reject`)
export const getPendingReqs = ()  => API.get('/users/requests')
export const getConnections = ()  => API.get('/users/connections')

// ── Notifications ─────────────────────────────────
export const getNotifications = ()  => API.get('/notifications')
export const getUnreadCount   = ()  => API.get('/notifications/unread-count')
export const markAllRead      = ()  => API.put('/notifications/mark-read')

// ── Helper ────────────────────────────────────────
function buildQuery(params) {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join('&')
  return q ? `?${q}` : ''
}
export const disconnectUser = id => API.post(`/users/${id}/disconnect`)

export const uploadAvatar = (formData) => API.post('/users/me/avatar', formData)
export const uploadCover  = (formData) => API.post('/users/me/cover',  formData)
*/


import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api'
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
export const getFeed = (type, connOnly, global) =>
  API.get(`/posts${buildQuery({
    type:        type     || '',
    connections: connOnly ? 'true' : undefined,
    global:      global   ? 'true' : undefined
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
export const getMyPosts    = ()  => API.get('/users/me/posts')
export const getSavedPosts = ()  => API.get('/users/me/saved')

// ── Profile photo upload ───────────────────────────
// Use fetch directly in component — axios breaks FormData sometimes
// These helpers are here for reference
export const uploadAvatar = formData => API.post('/users/me/avatar', formData)
export const uploadCover  = formData => API.post('/users/me/cover',  formData)

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