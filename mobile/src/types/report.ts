import type { IsoDate, ObjectId } from './api';

export type ReportReason = 'spam' | 'hate' | 'harassment' | 'misinformation' | 'other';

/** Web PostCard.jsx report menu, same order and labels. */
export const REPORT_REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: 'spam', label: '🗑️ Spam' },
  { id: 'hate', label: '😡 Hate speech' },
  { id: 'harassment', label: '🚫 Harassment' },
  { id: 'misinformation', label: '❌ Misinformation' },
  { id: 'other', label: '⚠️ Other' },
];

export const MAX_REPORT_NOTE = 300;

export type Report = {
  _id: ObjectId;
  targetType: 'post' | 'user' | 'reply';
  post?: ObjectId;
  user?: ObjectId;
  replyId?: ObjectId;
  reason: ReportReason;
  note?: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: IsoDate;
};
