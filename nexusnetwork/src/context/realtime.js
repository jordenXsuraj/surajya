import { createContext, useContext } from 'react'

// Staged features (MeetNow, messages) and the live connection; provided by RealtimeContext.jsx
export const NONE = { meetnow: false, dm: false }
export const RealtimeCtx = createContext({ features: NONE, loaded: false, socket: null, connected: false })
export const useRealtime = () => useContext(RealtimeCtx)
