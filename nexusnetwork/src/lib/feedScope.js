// Home feed filter: the last choice is remembered for this browser session
export const FEED_SCOPES = ['global', 'college', 'following']
const KEY = 'home_feed_scope'

export function savedFeedScope() {
  try {
    const v = sessionStorage.getItem(KEY)
    return FEED_SCOPES.includes(v) ? v : 'global'
  } catch {
    return 'global'
  }
}

export function saveFeedScope(scope) {
  try { sessionStorage.setItem(KEY, scope) } catch { /* private mode: not remembered */ }
}
