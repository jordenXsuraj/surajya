// After a reconnect: fetch every message newer than the last one this screen already has, page by
// page (the server answers ?after=<time> oldest first). `fetchAfter(after)` returns an axios promise.
export async function catchUpMessages(fetchAfter, lastCreatedAt, pageSize = 100, maxPages = 10) {
  const all = []
  let after = lastCreatedAt
  for (let i = 0; i < maxPages; i++) {
    const { data } = await fetchAfter(after)
    all.push(...data)
    if (data.length < pageSize) break
    after = data[data.length - 1].createdAt
  }
  return all
}

// The newest message that came from the server (not a local pending or failed one)
export function lastServerMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (!m.pending && !m.failed && !String(m._id).startsWith('tmp-')) return m
  }
  return null
}
