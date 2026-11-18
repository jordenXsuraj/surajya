// Small helpers shared by MeetNow and direct messages
import { useEffect, useState } from 'react'

// Re-render every `ms` so relative times ("2h 15m left", "5m ago") stay current
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export const REPORT_REASONS = [
  ['spam', '🗑️ Spam'],
  ['hate', '😡 Hate speech'],
  ['harassment', '🚫 Harassment'],
  ['misinformation', '❌ Misinformation'],
  ['other', '⚠️ Other'],
]

// Error message from an API failure
export const errorText = (err, fallback = 'Something went wrong. Please try again.') =>
  err?.response?.data?.message || (err?.response ? fallback : 'No connection. Check your internet and try again.')
