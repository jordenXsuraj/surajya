import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRealtime } from '../../context/realtime'
import { openConversation, reportEmailNotVerified } from '../../services/api'
import { errorText } from '../../lib/ui'

// "Message" on someone's profile: opens (or starts) the private chat with them.
// Nothing unless direct messages are available to this account.
export default function MessageButton({ userId, onError }) {
  const { features } = useRealtime()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!features.dm) return null

  async function open() {
    setBusy(true)
    try {
      const { data } = await openConversation(userId)
      nav(`/messages/${data._id}`)
    } catch (err) {
      if (!reportEmailNotVerified(err.response?.status, err.response?.data)) onError?.(`⚠️ ${errorText(err, 'Could not open the chat.')}`)
      setBusy(false)
    }
  }

  return (
    <button className="disconnect-btn" onClick={open} disabled={busy} style={{ marginLeft: 8 }} aria-label="Send a message">
      {busy ? '…' : '💬 Message'}
    </button>
  )
}
