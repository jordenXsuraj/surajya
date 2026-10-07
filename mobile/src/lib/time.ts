// Ported from the web (PostCard.jsx / Home.jsx timeAgo, PostCard.jsx "Today Only" badge).

const HOUR = 3_600_000;

/** "just now" (< 1 h), "5h ago" (< 24 h), "3d ago". */
export function timeAgo(date: string | number | Date, now: number = Date.now()): string {
  const h = Math.floor((now - new Date(date).getTime()) / HOUR);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Whole hours left until `expiresAt`, rounded up, never negative. */
export function hoursLeft(expiresAt: string | number | Date, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / HOUR));
}

/** Web: "⏳ 5h left · Today Only". */
export function todayOnlyLabel(
  expiresAt: string | number | Date,
  now: number = Date.now(),
): string {
  return `⏳ ${hoursLeft(expiresAt, now)}h left · Today Only`;
}
