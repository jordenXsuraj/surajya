
import { useState, useCallback, useRef, useEffect } from 'react'

export function useToast() {
  const [msg, setMsg] = useState('')
  const timerRef = useRef(null)

  const show = useCallback((m) => {
    if (timerRef.current) clearTimeout(timerRef.current)

    setMsg('')
    timerRef.current = setTimeout(() => setMsg(m), 10)
  }, [])

  const clear = useCallback(() => setMsg(''), [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return { msg, show, clear }
}