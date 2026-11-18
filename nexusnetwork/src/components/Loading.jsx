import { canObserve } from '../hooks/useLoadMore'

// Loading states shared by the Home feed and Connect: skeleton cards for a first load (same box as the
// real card, so nothing jumps when the content arrives), a small spinner while more loads, and the
// footer under a list (spinner · "Couldn't load more · Retry" · "Load more" fallback · all caught up).
// The shimmer is static grey with reduced motion (index.css).

export function Spinner({ label = 'Loading…' }) {
  return (
    <span className="spin-wrap" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="spin-label">{label}</span>
    </span>
  )
}

// A text post: author row, two lines of text, the action buttons
export function PostSkeleton() {
  return (
    <div className="post-card skel-post" aria-hidden="true">
      <div className="pc-head">
        <span className="skel skel-circle" style={{ width: 38, height: 38 }} />
        <div className="skel-lines">
          <span className="skel" style={{ width: '42%', height: 13 }} />
          <span className="skel" style={{ width: '28%', height: 10 }} />
        </div>
        <span className="skel skel-pill" style={{ width: 70, height: 24 }} />
      </div>
      <div className="pc-body">
        <div className="skel-text">
          <span className="skel" style={{ width: '92%' }} />
          <span className="skel" style={{ width: '64%' }} />
        </div>
      </div>
      <div className="pc-actions">
        <span className="skel skel-btn" style={{ width: 52 }} />
        <span className="skel skel-btn" style={{ width: 44 }} />
        <span className="skel skel-btn" style={{ width: 36, height: 36, marginLeft: 'auto' }} />
      </div>
    </div>
  )
}

// A student: avatar, name, year/branch/college, three skill tags, the Connect button and followers
export function PersonSkeleton() {
  return (
    <div className="person-card skel-person" aria-hidden="true">
      <span className="skel skel-circle" style={{ width: 48, height: 48, flexShrink: 0 }} />
      <div className="person-info">
        {/* rows as tall as the real text lines (18 and 15 px), bars centred in them */}
        <div className="person-name skel-row" style={{ height: 18 }}><span className="skel" style={{ width: '55%', height: 14 }} /></div>
        <div className="person-role skel-row" style={{ height: 15 }}><span className="skel" style={{ width: '80%', height: 11 }} /></div>
        <div className="person-skills">
          {[46, 58, 40].map(w => <span key={w} className="skel skel-tag" style={{ width: w }} />)}
        </div>
      </div>
      <div className="skel-person-side">
        <span className="skel skel-pill" style={{ width: 78, height: 27 }} />
        <span className="skel" style={{ width: 54, height: 9 }} />
      </div>
    </div>
  )
}

export function Skeletons({ count = 3, of }) {
  const Card = of
  return (
    <div className="skel-list" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => <Card key={i} />)}
    </div>
  )
}

// Under a list that loads more by itself. `sentinel` is the ref from useLoadMore.
export function ListFooter({ sentinel, count, loadingMore, error, hasMore, onRetry, onMore, endText = 'You’re all caught up 🎉' }) {
  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      {count > 0 && (
        <div className="list-foot">
          {loadingMore ? <Spinner />
            : error ? <>Couldn’t load more · <button className="foot-link" onClick={onRetry}>Retry</button></>
              : hasMore ? (canObserve ? null : <button className="foot-more" onClick={onMore}>Load more</button>)
                : endText}
        </div>
      )}
    </>
  )
}

// A first load that failed: a message with Retry instead of an empty list
export function LoadError({ what, onRetry }) {
  return (
    <div className="load-error" role="alert">
      Couldn’t load {what} · <button className="foot-link" onClick={onRetry}>Retry</button>
    </div>
  )
}
