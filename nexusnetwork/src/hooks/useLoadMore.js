import { useEffect, useRef } from 'react'

export const canObserve = typeof window !== 'undefined' && 'IntersectionObserver' in window

// Infinite loading: put the returned ref on an empty marker under the last item. `onMore` runs when the
// marker comes within `margin` px of the screen. The observer is renewed when `watch` changes (e.g.
// the number of items), so a list that is still too short after a page loads asks for the next one.
// Without IntersectionObserver nothing happens: show a "Load more" button instead (canObserve).
export default function useLoadMore(onMore, { enabled = true, margin = 300, watch } = {}) {
  const ref = useRef(null)
  const latest = useRef(onMore)
  useEffect(() => { latest.current = onMore })

  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || !canObserve) return
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) latest.current?.()
    }, { rootMargin: `0px 0px ${margin}px 0px` })
    io.observe(el)
    return () => io.disconnect()
  }, [enabled, margin, watch])

  return ref
}
