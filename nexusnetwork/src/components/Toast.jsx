

import { useEffect } from 'react'

export default function Toast({ msg, onClose, type = 'info' }) {
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => onClose(), 2600)
    return () => clearTimeout(t)
  }, [msg])

  if (!msg) return null

  return (
    <div
      className={`toast-msg ${type}`}
      onClick={onClose}
      role="alert"
      aria-live="polite"
    >
      {msg}
    </div>
  )
}