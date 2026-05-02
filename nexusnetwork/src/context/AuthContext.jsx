

import { createContext, useContext, useState, useEffect } from 'react'
import { getMyProfile } from '../services/api'

import { useRef } from 'react'


const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
const requestRef = useRef(0)
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nx_user')) || null }
    catch { return null }
  })

  const [token, setToken] = useState(
    () => localStorage.getItem('nx_token') || null
  )

  // ✅ FIXED
useEffect(() => {
  if (!token) return

  const reqId = ++requestRef.current

  const run = async () => {
    try {
      const res = await getMyProfile()

      // ❌ ignore old responses
      if (reqId !== requestRef.current) return

      const fresh = res.data
      setUser(fresh)
      localStorage.setItem('nx_user', JSON.stringify(fresh))

    } catch (e) {
      if (reqId !== requestRef.current) return

      if (e.response?.status === 401) logout()
    }
  }

  run()

}, [token])

    function login(userData, tok) {
       requestRef.current++   // 🚨 cancel old requests

      setUser(userData)
      setToken(tok)

      localStorage.setItem('nx_user', JSON.stringify(userData))
      localStorage.setItem('nx_token', tok)
   }

  function logout() {
  requestRef.current++   // 🚨 cancel pending requests

  setUser(null)
  setToken(null)

  localStorage.removeItem('nx_user')
  localStorage.removeItem('nx_token')
}

  function updateUser(data) {
    const merged = { ...(user || {}), ...data }
    setUser(merged)
    localStorage.setItem('nx_user', JSON.stringify(merged))
  }

 async function refreshUser() {
  const reqId = ++requestRef.current

  try {
    const res = await getMyProfile()

    if (reqId !== requestRef.current) return

    const fresh = res.data
    setUser(fresh)

    const prev = localStorage.getItem('nx_user')
    const next = JSON.stringify(fresh)

    if (prev !== next) {
      localStorage.setItem('nx_user', next)
    }

  } catch (e) {
    if (reqId !== requestRef.current) return

    if (e.response?.status === 401) logout()
  }
}

  return (
    <AuthCtx.Provider value={{ user, token, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthCtx.Provider>
  )
}

export const useAuth = () => useContext(AuthCtx)