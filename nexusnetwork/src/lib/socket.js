import { io } from 'socket.io-client'

// The API's origin (VITE_API_URL is ".../api"); Socket.IO listens on the same server at /socket.io
function socketOrigin() {
  try { return new URL(import.meta.env.VITE_API_URL).origin }
  catch { return window.location.origin }
}

// One connection per signed-in tab. The token is read at every (re)connect, so a token renewed by
// "log out other devices" or a password change is picked up without reloading. WebSocket only (no
// long-polling fallback): every reconnect is a fresh connection, and screens catch up on reconnect.
export function createSocket() {
  return io(socketOrigin(), {
    autoConnect: false,
    auth: cb => cb({ token: localStorage.getItem('nx_token') }),
    transports: ['websocket'],
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  })
}

// emit with an acknowledgement, as a promise; resolves { ok: false } after `ms` without an answer
export function request(socket, event, payload, ms = 8000) {
  return new Promise(resolve => {
    if (!socket?.connected) return resolve({ ok: false })
    const timer = setTimeout(() => resolve({ ok: false, timeout: true }), ms)
    socket.emit(event, payload, reply => { clearTimeout(timer); resolve(reply || { ok: false }) })
  })
}
