import { useEffect, useRef, useState } from 'react'

// Pull down at the very top of the page to refresh (touch screens). Returns how far the finger has
// pulled (px, damped) so the page can draw an indicator. The browser's own pull-to-refresh reloads the
// whole app, so the page turns it off while this is in use (overscroll-behavior on <html>).
export default function usePullToRefresh(onRefresh, { threshold = 64, enabled = true } = {}) {
  const [pull, setPull] = useState(0)
  const latest = useRef(onRefresh)
  useEffect(() => { latest.current = onRefresh })

  useEffect(() => {
    if (!enabled) return
    const root = document.documentElement
    root.classList.add('no-native-ptr')
    let startX = 0, startY = null, active = false, dist = 0
    const reset = () => { startY = null; active = false; dist = 0; setPull(0) }
    const onStart = e => {
      startY = window.scrollY <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null
      startX = e.touches[0]?.clientX ?? 0
      active = false; dist = 0
    }
    const onMove = e => {
      if (startY === null) return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      if (!active) {
        // only a clear downward drag that starts at the top (not a sideways swipe of a row)
        if (window.scrollY > 0 || dy < -6 || Math.abs(dx) > Math.abs(dy) + 4) { startY = null; return }
        if (dy < 10) return
        active = true
      }
      dist = Math.max(0, Math.min((dy - 10) * 0.5, threshold * 1.5))
      setPull(dist)
    }
    const onEnd = () => {
      const go = active && dist >= threshold
      reset()
      if (go) latest.current?.()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      root.classList.remove('no-native-ptr')
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [enabled, threshold])

  return pull
}
