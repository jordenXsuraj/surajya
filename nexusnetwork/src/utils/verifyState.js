// When the last verification code was sent (signup, resend, email change), so the
// 60-second resend countdown survives navigation. Per tab; the server enforces it anyway.
const KEY = 'nx_code_sent_at'
export const RESEND_SECONDS = 60

export function markCodeSent() {
  try { sessionStorage.setItem(KEY, String(Date.now())) } catch { /* private mode */ }
}

export function secondsUntilResend() {
  let at = 0
  try { at = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* private mode */ }
  return Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - at) / 1000))
}
