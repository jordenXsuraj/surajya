import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { NONE, RealtimeCtx, useRealtime } from './realtime'
import { getFeatures } from '../services/api'
import { createSocket } from '../lib/socket'

// Staged features (MeetNow, messages) and the live connection they use.
// The server decides who may use them (GET /api/app/features); while a feature is off for this
// account, its pages redirect home and its entry points are hidden. The socket is only opened when
// at least one of them is available.

const REFRESH_MS = 5 * 60 * 1000

export function RealtimeProvider({ children }) {
  const { token } = useAuth()
  const [fetched, setFetched] = useState({ token: null, features: NONE })
  const [connected, setConnected] = useState(false)

  // Which features this account has; again when the tab comes back after a while
  useEffect(() => {
    if (!token) return
    let alive = true
    let last = 0
    const load = () => {
      last = Date.now()
      getFeatures()
        .then(r => { if (alive) setFetched({ token, features: { ...NONE, ...r.data } }) })
        .catch(() => { if (alive) setFetched({ token, features: NONE }) })
    }
    const onFocus = () => { if (Date.now() - last > REFRESH_MS) load() }
    load()
    window.addEventListener('focus', onFocus)
    return () => { alive = false; window.removeEventListener('focus', onFocus) }
  }, [token])

  // Only what was fetched for the current session counts
  const loaded = Boolean(token) && fetched.token === token
  const features = loaded ? fetched.features : NONE

  const wanted = Boolean(token && (features.meetnow || features.dm))
  const socket = useMemo(() => (wanted ? createSocket() : null), [wanted])   // not connected yet
  useEffect(() => {
    if (!socket) return
    const onConnect = () => setConnected(true)
    const onDisconnect = reason => {
      setConnected(false)
      // The server dropped us (sessions revoked elsewhere): try again with the stored token; if it
      // is no longer valid the handshake is refused and we stay offline
      if (reason === 'io server disconnect') setTimeout(() => socket.connect(), 1500)
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.connect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.disconnect()
    }
  }, [socket])

  return (
    <RealtimeCtx.Provider value={{ features, loaded, socket, connected: Boolean(socket) && connected }}>
      {children}
    </RealtimeCtx.Provider>
  )
}

// Route guard for a staged feature's pages
export function RequireFeature({ feature, children }) {
  const { features, loaded } = useRealtime()
  if (!loaded) return <div className="feed-loading">Loading…</div>
  return features[feature] ? children : <Navigate to="/home" replace />
}
