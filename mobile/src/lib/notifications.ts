import { allowedAppPath } from '@/lib/deepLinks';
import { colors } from '@/theme/tokens';
import type { Notification, NotificationType } from '@/types/notification';
import type { PostType } from '@/types/post';

export type NotifMeta = { icon: string; color: string };

/** Web Connect.jsx NOTIF_META, plus `interested` (the web shows a plain 🔔 for it). */
export const NOTIF_META: Record<NotificationType, NotifMeta> = {
  post_liked: { icon: '❤️', color: colors.like },
  post_replied: { icon: '💬', color: colors.blue },
  connection_request: { icon: '🤝', color: colors.green },
  connection_accepted: { icon: '✅', color: colors.green },
  new_post: { icon: '📝', color: colors.purple },
  interested: { icon: '🙋', color: colors.yellow },
};

const FALLBACK_META: NotifMeta = { icon: '🔔', color: colors.muted };

export const notifMeta = (type: string): NotifMeta =>
  NOTIF_META[type as NotificationType] ?? FALLBACK_META;

const POST_NOTIFICATIONS = new Set<string>(['post_liked', 'post_replied', 'interested', 'new_post']);

const idOf = (value: { _id: unknown } | string | null | undefined): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return value._id ? String(value._id) : null;
};

export const senderOf = (n: Notification) =>
  n.sender && typeof n.sender === 'object' ? n.sender : null;

export const postOf = (n: Notification) => (n.post && typeof n.post === 'object' ? n.post : null);

/** What tapping a notification opens. */
export type NotificationTarget =
  | { kind: 'open'; path: `/post/${string}` | `/profile/${string}` }
  /** A post notification whose post was deleted (or expired). */
  | { kind: 'postGone' }
  | { kind: 'none' };

/** Post types → the post; follow types → the sender's profile. */
export function notificationTarget(n: Pick<Notification, 'type' | 'post' | 'sender'>): NotificationTarget {
  if (POST_NOTIFICATIONS.has(n.type)) {
    const postId = idOf(n.post);
    return postId ? { kind: 'open', path: `/post/${postId}` } : { kind: 'postGone' };
  }
  const senderId = idOf(n.sender);
  return senderId ? { kind: 'open', path: `/profile/${senderId}` } : { kind: 'none' };
}

const POST_TYPE_WORD: Partial<Record<PostType, string>> = {
  placement: 'placement',
  qa: 'Q&A',
  study: 'study',
  project: 'project',
  social: 'social',
};

/**
 * The text after the sender's name, in the app's follow wording. The server's own messages
 * still say "Connect request" in places; the push body keeps the server text.
 */
export function notificationText(n: Notification): string {
  const postType = postOf(n)?.type;
  const word = postType ? POST_TYPE_WORD[postType] : undefined;
  switch (n.type) {
    case 'post_liked':
      return 'liked your post';
    case 'post_replied':
      return 'replied to your post';
    case 'connection_request':
      return 'wants to follow you';
    case 'connection_accepted':
      return 'accepted your follow request';
    case 'new_post':
      return word ? `shared a new ${word} post` : 'shared a new post';
    case 'interested':
      return word ? `is interested in your ${word} post` : 'is interested in your post';
    default:
      return n.message;
  }
}

export type NotificationSection = 'Today' | 'This week' | 'Earlier';

export type NotificationRow =
  | { kind: 'header'; key: string; title: NotificationSection }
  | { kind: 'item'; key: string; notification: Notification };

const DAY_MS = 24 * 60 * 60 * 1000;

function sectionOf(createdAt: string, startOfToday: number): NotificationSection {
  const t = new Date(createdAt).getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 6 * DAY_MS) return 'This week';
  return 'Earlier';
}

/**
 * Today / This week (the 6 days before today) / Earlier, by local calendar day, newest first.
 * The server sorts unread first, so the loaded pages are re-sorted here.
 */
export function notificationRows(
  items: readonly Notification[],
  now: number = Date.now(),
): NotificationRow[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const startOfToday = today.getTime();

  const seen = new Set<string>();
  const sorted = items
    .filter((n) => {
      const id = String(n._id);
      if (seen.has(id)) return false; // a page boundary can repeat an item after new ones arrive
      seen.add(id);
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const rows: NotificationRow[] = [];
  let current: NotificationSection | null = null;
  for (const n of sorted) {
    const section = sectionOf(n.createdAt, startOfToday);
    if (section !== current) {
      rows.push({ kind: 'header', key: `h-${section}`, title: section });
      current = section;
    }
    rows.push({ kind: 'item', key: String(n._id), notification: n });
  }
  return rows;
}

/** Push payload from server/services/notify.js: `data: { type, postId, senderId, url }`. */
export type PushData = {
  type?: string;
  postId?: string | null;
  senderId?: string | null;
  url?: string;
};

/**
 * Where tapping a push goes: the server's `url` when it is a screen the app has, otherwise the
 * post or sender, otherwise the notifications screen.
 */
export function pushPath(data: PushData | null | undefined): string {
  if (data?.url) {
    const path = allowedAppPath(data.url);
    if (path) return path;
  }
  if (data?.postId) return `/post/${data.postId}`;
  if (data?.senderId) return `/profile/${data.senderId}`;
  return '/notifications';
}
