import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMeetups, joinMeetup } from '../../services/api'
import { useRealtime } from '../../context/realtime'
import { request } from '../../lib/socket'
import { isActive } from './meta'
import { errorText } from './util'

// Active meetups for this user, kept live: counts change, ended ones disappear, new ones load.
// Expired cards also drop out on the client clock (the server already refuses them).
export function useMeetupList({ category, limit = 20 } = {}) {
  const { socket, connected } = useRealtime()
  const key = `${category || ''}|${limit}`
  const [data, setData] = useState({ key: null, list: [], error: '' })
  const reloadTimer = useRef(null)

  const load = useCallback(() => {
    return getMeetups(category, limit)
      .then(r => setData({ key, list: r.data || [], error: '' }))
      .catch(err => setData(d => ({ key, list: d.key === key ? d.list : [], error: errorText(err, 'Could not load MeetNows.') })))
  }, [category, limit, key])

  useEffect(() => { load() }, [load])
  const loading = data.key !== key
  const setList = useCallback(fn => setData(d => ({ ...d, list: fn(d.list) })), [])

  // Without a live connection (server waking up, network change) refresh every 30 s
  useEffect(() => {
    if (connected) return
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [connected, load])

  useEffect(() => {
    if (!socket || !connected) return
    request(socket, 'meetnow:watch')
    const onMembers = ({ meetupId, memberCount }) =>
      setList(l => l.map(m => (m._id === meetupId ? { ...m, memberCount } : m)))
    const onEnded = ({ meetupId }) => setList(l => l.filter(m => m._id !== meetupId))
    const onCreated = () => {   // several at once → one reload
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(load, 800)
    }
    socket.on('meetup:members', onMembers)
    socket.on('meetup:ended', onEnded)
    socket.on('meetup:created', onCreated)
    load()   // catch up on what happened while disconnected
    return () => {
      socket.off('meetup:members', onMembers)
      socket.off('meetup:ended', onEnded)
      socket.off('meetup:created', onCreated)
      clearTimeout(reloadTimer.current)
    }
  }, [socket, connected, load, setList])

  return { list: data.list.filter(m => isActive(m)), loading, error: data.error, reload: load, setList }
}

// JOIN on a card: join, then open the chat; OPEN CHAT just opens it
export function useJoinAndOpen(onError) {
  const nav = useNavigate()
  const [busyId, setBusyId] = useState(null)
  const joinAndOpen = useCallback(async meetup => {
    if (meetup.joined) return nav(`/meetnow/${meetup._id}/chat`)
    setBusyId(meetup._id)
    try {
      await joinMeetup(meetup._id)
      nav(`/meetnow/${meetup._id}/chat`)
    } catch (err) {
      onError?.(errorText(err, 'Could not join.'), err, meetup)
    } finally {
      setBusyId(null)
    }
  }, [nav, onError])
  return { busyId, joinAndOpen }
}
