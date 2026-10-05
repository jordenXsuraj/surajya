import type { IsoDate, ObjectId } from './api';

export type ReportReason = 'spam' | 'hate' | 'harassment' | 'misinformation' | 'other';

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
